import { ChildProcess, execFile, spawn } from "child_process";
import { createHash } from "crypto";
import { readFile, stat, statfs } from "fs/promises";
import { isAbsolute, join, relative, resolve } from "path";
import { promisify } from "util";
import { ApplicationAcceptanceEvidence, BrowserJourneyPlan, FunctionalAcceptancePlan,
    FunctionalRuntimeCommand, FunctionalRuntimeProbe, NativeJourneyPlan, PreviewManifest } from "./contracts";
import { ProtectedEnvironmentResolver } from "./protected-environment";
import { DistributedPlatformGraph } from "../platform-convergence";

const exactRevision = /^[a-f0-9]{7,40}$/i;

export interface RuntimeProbeObservation {
    readonly probe: FunctionalRuntimeProbe;
    readonly status: number;
    readonly responseExcerpt: string;
    readonly durationMs: number;
    readonly passed: boolean;
}

export interface BrowserJourneyObservation {
    readonly journey: BrowserJourneyPlan;
    readonly durationMs: number;
    readonly artifacts: readonly string[];
    readonly verifiedDimensions: BrowserJourneyPlan["verifiedDimensions"];
    readonly passed: boolean;
}

export interface NativeJourneyObservation {
    readonly journey: NativeJourneyPlan;
    readonly durationMs: number;
    readonly artifacts: readonly string[];
    readonly verifiedDimensions: NativeJourneyPlan["verifiedDimensions"];
    readonly passed: boolean;
}

export interface FunctionalRuntimeResult {
    readonly evidence: readonly ApplicationAcceptanceEvidence[];
    readonly preview: PreviewManifest;
    readonly probes: readonly RuntimeProbeObservation[];
    readonly journeys: readonly BrowserJourneyObservation[];
    readonly nativeJourneys: readonly NativeJourneyObservation[];
    readonly applicationLogs: string;
}

export interface ApplicationProcess {
    readonly logs: () => string;
    stop(): Promise<void>;
}

export interface ApplicationLauncher {
    launch(plan: FunctionalAcceptancePlan, environment?: NodeJS.ProcessEnv): Promise<ApplicationProcess>;
}

export interface RuntimeProbeRunner {
    run(plan: FunctionalAcceptancePlan, probe: FunctionalRuntimeProbe): Promise<RuntimeProbeObservation>;
}

export interface BrowserJourneyRuntime {
    run(plan: FunctionalAcceptancePlan, journey: BrowserJourneyPlan, environment?: NodeJS.ProcessEnv): Promise<BrowserJourneyObservation>;
}

export interface NativeJourneyRuntime {
    run(plan: FunctionalAcceptancePlan, journey: NativeJourneyPlan,
        environment?: NodeJS.ProcessEnv): Promise<NativeJourneyObservation>;
}

export type FunctionalRuntimeTelemetryEvent = "PREREQUISITES_VERIFIED" | "APPLICATION_HEALTHY" | "RUNTIME_PROBES_VERIFIED" |
    "VISUAL_CANON_VERIFIED" | "BROWSER_JOURNEYS_VERIFIED" | "NATIVE_JOURNEYS_VERIFIED" | "DURABLE_PREVIEW_VERIFIED";

export type FunctionalRuntimeReporter = (event: FunctionalRuntimeTelemetryEvent,
    detail: Readonly<Record<string, unknown>>) => void;

type AvailableDiskBytes = (workingDirectory: string) => Promise<number>;

const availableDiskBytes: AvailableDiskBytes = async workingDirectory => {
    const filesystem = await statfs(workingDirectory);
    return filesystem.bavail * filesystem.bsize;
};

async function exists(path: string): Promise<boolean> {
    try { await stat(path); return true; } catch { return false; }
}

interface BoundedCommandFailure extends Error {
    readonly stdout: string;
    readonly stderr: string;
    readonly code?: number;
    readonly signal?: NodeJS.Signals;
    readonly timedOut: boolean;
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
    if (child.exitCode !== null) return;
    if (process.platform !== "win32" && child.pid) {
        try {
            process.kill(-child.pid, signal);
            return;
        } catch {
            // The process may have exited between the state check and signal.
        }
    }
    try { child.kill(signal); } catch { /* Process already exited. */ }
}

async function runBoundedCommand(command: FunctionalRuntimeCommand, workingDirectory: string,
    environment: NodeJS.ProcessEnv, defaultTimeoutMs: number): Promise<Readonly<{ stdout: string; stderr: string }>> {
    const timeoutMs = command.timeoutMs ?? defaultTimeoutMs;
    const outputLimit = 10 * 1024 * 1024;
    return await new Promise<Readonly<{ stdout: string; stderr: string }>>((resolveCommand, rejectCommand) => {
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;
        let forceTimer: NodeJS.Timeout | undefined;
        const child = spawn(command.command, [...command.args], {
            cwd: workingDirectory, env: environment, stdio: ["ignore", "pipe", "pipe"],
            detached: process.platform !== "win32"
        });
        child.stdout?.on("data", chunk => { stdout = `${stdout}${String(chunk)}`.slice(-outputLimit); });
        child.stderr?.on("data", chunk => { stderr = `${stderr}${String(chunk)}`.slice(-outputLimit); });
        const timeout = setTimeout(() => {
            timedOut = true;
            signalProcessTree(child, "SIGTERM");
            forceTimer = setTimeout(() => signalProcessTree(child, "SIGKILL"), 1_000);
        }, timeoutMs);
        const finish = (code: number | null, signal: NodeJS.Signals | null, error?: Error): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (forceTimer) clearTimeout(forceTimer);
            if (!error && !timedOut && code === 0) {
                resolveCommand({ stdout, stderr });
                return;
            }
            const failure = Object.assign(error ?? new Error(timedOut
                ? `Command timed out after ${timeoutMs}ms.`
                : `Command exited with ${code ?? signal ?? "UNKNOWN"}.`), {
                stdout, stderr, code: code ?? undefined, signal: signal ?? undefined, timedOut
            }) as BoundedCommandFailure;
            rejectCommand(failure);
        };
        child.once("error", error => finish(child.exitCode, child.signalCode, error));
        child.once("close", (code, signal) => finish(code, signal));
    });
}

export function redactFunctionalRuntimeOutput(value: string, environment: NodeJS.ProcessEnv,
    protectedNames: readonly string[]): string {
    let safe = value;
    for (const name of new Set(protectedNames)) {
        const secret = environment[name];
        if (secret) safe = safe.replaceAll(secret, "[REDACTED]");
    }
    return safe
        .replace(/authorization\s*[:=]\s*bearer\s+[^\s]+/gi, "authorization: Bearer [REDACTED]")
        .replace(/(token|secret|password)\s*[:=]\s*[^\s]+/gi, "$1=[REDACTED]");
}

function governedPath(workingDirectory: string, repositoryPath: string, label: string): string {
    const absolutePath = resolve(workingDirectory, repositoryPath);
    const relativePath = relative(workingDirectory, absolutePath);
    if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
        throw new Error(`${label} must remain inside the governed repository: ${repositoryPath}`);
    }
    return absolutePath;
}

export async function verifyVisualCanonContract(plan: FunctionalAcceptancePlan, journey: BrowserJourneyPlan): Promise<void> {
    const contract = journey.visualCanon;
    if (!contract) return;
    const manifestPath = governedPath(plan.workingDirectory, contract.manifestPath, "Visual canon manifest");
    const manifestMetadata = await stat(manifestPath);
    if (!manifestMetadata.isFile() || manifestMetadata.size === 0) {
        throw new Error(`Visual canon manifest is missing or empty: ${contract.manifestPath}`);
    }
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        schemaVersion?: unknown;
        screenId?: unknown;
        route?: unknown;
        authority?: unknown;
        assets?: readonly { path?: unknown; sha256?: unknown; required?: unknown }[];
    };
    if (manifest.schemaVersion !== 1 || manifest.screenId !== contract.screenId ||
        manifest.route !== contract.requiredRoute || manifest.authority !== "USER_APPROVED_CANON_REFERENCE") {
        throw new Error(`Visual canon manifest does not authorize ${contract.screenId} at ${contract.requiredRoute}.`);
    }
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    for (const assetPath of contract.requiredAssets) {
        const declaration = assets.find(asset => asset.path === assetPath && asset.required === true);
        if (!declaration || typeof declaration.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(declaration.sha256)) {
            throw new Error(`Visual canon asset is not hash-bound in the approved manifest: ${assetPath}`);
        }
        const absolutePath = governedPath(plan.workingDirectory, assetPath, "Visual canon asset");
        const metadata = await stat(absolutePath);
        if (!metadata.isFile() || metadata.size === 0) throw new Error(`Visual canon asset is missing or empty: ${assetPath}`);
        const digest = createHash("sha256").update(await readFile(absolutePath)).digest("hex");
        if (digest !== declaration.sha256.toLowerCase()) {
            throw new Error(`Visual canon asset digest does not match the approved manifest: ${assetPath}`);
        }
    }
}

function isDependencyBootstrap(command: FunctionalRuntimeCommand): boolean {
    const executable = command.command.split("/").at(-1);
    const action = command.args[0];
    return (executable === "npm" && ["ci", "install"].includes(action)) ||
        (["pnpm", "yarn", "bun"].includes(executable ?? "") && action === "install") ||
        (executable === "corepack" && ["pnpm", "yarn"].includes(action) && command.args[1] === "install");
}

const DEPENDENCY_BOOTSTRAP_TIMEOUT_MS = 900_000;
const DEPENDENCY_PREPARATION_HEADROOM_BYTES = 1024 * 1024 * 1024;

function normalizeDependencyBootstrap(command: FunctionalRuntimeCommand): FunctionalRuntimeCommand {
    if (!isDependencyBootstrap(command)) return command;
    const executable = command.command.split("/").at(-1);
    const npmCleanInstall = executable === "npm" && command.args[0] === "ci";
    const args = npmCleanInstall
        ? [...command.args, ...["--no-audit", "--no-fund"].filter(flag => !command.args.includes(flag))]
        : command.args;
    return { ...command, args, timeoutMs: Math.max(command.timeoutMs ?? 0, DEPENDENCY_BOOTSTRAP_TIMEOUT_MS) };
}

/**
 * Restores reproducible dependency preparation for durable plans created by an
 * older PBOS revision. A Node application may never advance to launch merely
 * because a historical serialized plan omitted its install prerequisite.
 */
export async function resolveFunctionalPrerequisites(
    plan: FunctionalAcceptancePlan): Promise<readonly FunctionalRuntimeCommand[]> {
    const configured = [...(plan.prerequisites ?? [])].map(normalizeDependencyBootstrap);
    if (configured.some(isDependencyBootstrap)) return configured;
    if (!await exists(join(plan.workingDirectory, "package.json")) ||
        !["npm", "npx", "pnpm", "yarn", "bun"].includes(plan.launch.command.split("/").at(-1) ?? "")) {
        return configured;
    }
    const timeoutMs = DEPENDENCY_BOOTSTRAP_TIMEOUT_MS;
    if (await exists(join(plan.workingDirectory, "package-lock.json")) ||
        await exists(join(plan.workingDirectory, "npm-shrinkwrap.json"))) {
        return [{ command: "npm", args: ["ci", "--no-audit", "--no-fund"], timeoutMs }, ...configured];
    }
    if (await exists(join(plan.workingDirectory, "pnpm-lock.yaml"))) {
        return [{ command: "corepack", args: ["pnpm", "install", "--frozen-lockfile"], timeoutMs }, ...configured];
    }
    if (await exists(join(plan.workingDirectory, "yarn.lock"))) {
        return [{ command: "corepack", args: ["yarn", "install", "--immutable"], timeoutMs }, ...configured];
    }
    if (await exists(join(plan.workingDirectory, "bun.lock")) ||
        await exists(join(plan.workingDirectory, "bun.lockb"))) {
        return [{ command: "bun", args: ["install", "--frozen-lockfile"], timeoutMs }, ...configured];
    }
    throw new Error("Reproducible functional launch requires a dependency lockfile for this Node application.");
}

async function assertLocalLaunchExecutable(plan: FunctionalAcceptancePlan): Promise<void> {
    if (plan.launch.command.split("/").at(-1) !== "npm" || plan.launch.args[0] !== "run" || !plan.launch.args[1]) return;
    const manifest = JSON.parse(await readFile(join(plan.workingDirectory, "package.json"), "utf8")) as {
        scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
    };
    const script = manifest.scripts?.[plan.launch.args[1]];
    if (!script) throw new Error(`Application launch script is missing from package.json: ${plan.launch.args[1]}.`);
    const executable = script.trim().split(/\s+/)[0];
    const declared = manifest.dependencies?.[executable] !== undefined || manifest.devDependencies?.[executable] !== undefined;
    if (declared && !await exists(join(plan.workingDirectory, "node_modules", ".bin", executable))) {
        throw new Error(`Dependency preparation did not materialize the required application executable: ${executable}.`);
    }
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
    if (child.exitCode !== null) return;
    await new Promise<void>(resolve => {
        const timer = setTimeout(() => { signalProcessTree(child, "SIGKILL"); resolve(); }, timeoutMs);
        child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
}

export class NodeApplicationLauncher implements ApplicationLauncher {
    constructor(private readonly protectedEnvironment = new ProtectedEnvironmentResolver()) {}

    async launch(plan: FunctionalAcceptancePlan, runtimeEnvironment?: NodeJS.ProcessEnv): Promise<ApplicationProcess> {
        const command = plan.launch;
        if (!command.command.trim() || !plan.workingDirectory.trim()) throw new Error("Application launch command is incomplete.");
        const environment = runtimeEnvironment ?? await this.protectedEnvironment.resolve(
            [plan.launch, ...plan.browserJourneys.map(journey => journey.command)], plan.protectedEnvironmentFiles);
        let output = "";
        const child = spawn(command.command, [...command.args], {
            cwd: plan.workingDirectory,
            env: environment,
            stdio: ["ignore", "pipe", "pipe"],
            detached: process.platform !== "win32"
        });
        child.stdout?.on("data", chunk => { output = `${output}${String(chunk)}`.slice(-50_000); });
        child.stderr?.on("data", chunk => { output = `${output}${String(chunk)}`.slice(-50_000); });
        const startupFailure = new Promise<never>((_resolve, reject) => {
            child.once("error", reject);
            child.once("exit", code => reject(new Error(`Application exited before becoming healthy with code ${code ?? "UNKNOWN"}.\n${output}`)));
        });
        try {
            await Promise.race([this.waitUntilHealthy(plan), startupFailure]);
        } catch (error) {
            signalProcessTree(child, "SIGTERM");
            await waitForExit(child, 2_000);
            throw error;
        }
        return {
            logs: () => output,
            stop: async () => {
                signalProcessTree(child, "SIGTERM");
                await waitForExit(child, 2_000);
            }
        };
    }

    private async waitUntilHealthy(plan: FunctionalAcceptancePlan): Promise<void> {
        const deadline = Date.now() + plan.launch.startupTimeoutMs;
        const url = new URL(plan.launch.healthPath, plan.launch.baseUrl).toString();
        let lastFailure = "No response";
        while (Date.now() < deadline) {
            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
                if (response.ok) return;
                lastFailure = `HTTP ${response.status}`;
            } catch (error) {
                lastFailure = error instanceof Error ? error.message : String(error);
            }
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        throw new Error(`Application did not become healthy at ${url}: ${lastFailure}`);
    }
}

export class HttpRuntimeProbeRunner implements RuntimeProbeRunner {
    async run(plan: FunctionalAcceptancePlan, probe: FunctionalRuntimeProbe): Promise<RuntimeProbeObservation> {
        const startedAt = Date.now();
        const response = await fetch(new URL(probe.path, plan.launch.baseUrl), {
            method: probe.method ?? "GET",
            body: probe.requestBody === undefined ? undefined : JSON.stringify(probe.requestBody),
            headers: probe.requestBody === undefined ? undefined : { "content-type": "application/json" },
            signal: AbortSignal.timeout(10_000)
        });
        const body = (await response.text()).slice(0, 20_000);
        return { probe, status: response.status, responseExcerpt: body, durationMs: Date.now() - startedAt,
            passed: response.status === probe.expectedStatus && (!probe.responseIncludes || body.includes(probe.responseIncludes)) };
    }
}

export class CommandBrowserJourneyRuntime implements BrowserJourneyRuntime {
    constructor(private readonly protectedEnvironment = new ProtectedEnvironmentResolver()) {}

    async run(plan: FunctionalAcceptancePlan, journey: BrowserJourneyPlan,
        runtimeEnvironment?: NodeJS.ProcessEnv): Promise<BrowserJourneyObservation> {
        if (!journey.command.command.trim()) throw new Error(`Browser journey ${journey.journeyId} has no executable command.`);
        const environment = runtimeEnvironment ?? await this.protectedEnvironment.resolve(
            [plan.launch, ...plan.browserJourneys.map(item => item.command)], plan.protectedEnvironmentFiles);
        const startedAt = Date.now();
        try {
            await runBoundedCommand(journey.command, plan.workingDirectory, environment, 120_000);
        } catch (error) {
            const failure = error as BoundedCommandFailure;
            const protectedNames = new Set([
                ...(plan.launch.requiredEnvironmentVariables ?? []),
                ...(journey.command.requiredEnvironmentVariables ?? [])
            ]);
            const redact = (value: string): string => {
                let safe = value;
                for (const name of protectedNames) {
                    const secret = environment[name];
                    if (secret) safe = safe.replaceAll(secret, "[REDACTED]");
                }
                return safe.replace(/(token|secret|password|authorization)=?\s*[^\s]+/gi, "$1=[REDACTED]");
            };
            const output = redact(`${failure.stdout ?? ""}\n${failure.stderr ?? ""}`).trim().slice(-20_000);
            throw new Error(`Browser journey command failed for ${journey.journeyId}` +
                `${failure.timedOut ? ` (timed out after ${journey.command.timeoutMs ?? 120_000}ms)` :
                    failure.code === undefined ? "" : ` (exit ${failure.code})`}${output ? `\n${output}` : ""}`);
        }
        const artifacts = [...journey.screenshotArtifacts, journey.traceArtifact, journey.accessibilityArtifact,
            journey.acceptanceArtifact];
        const resolvedArtifacts = new Map<string, string>();
        for (const artifact of artifacts) {
            const artifactPath = resolve(plan.workingDirectory, artifact);
            const relativePath = relative(plan.workingDirectory, artifactPath);
            if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
                throw new Error(`Browser journey evidence must remain inside the governed repository: ${artifact}`);
            }
            const metadata = await stat(artifactPath);
            if (!metadata.isFile() || metadata.size === 0) throw new Error(`Browser journey evidence is missing or empty: ${artifact}`);
            resolvedArtifacts.set(artifact, artifactPath);
        }
        const report = JSON.parse(await readFile(resolvedArtifacts.get(journey.acceptanceArtifact)!, "utf8")) as {
            schemaVersion?: unknown; journeyId?: unknown; commit?: unknown;
            checks?: readonly { dimension?: unknown; passed?: unknown; detail?: unknown }[];
        };
        const checks = Array.isArray(report.checks) ? report.checks : [];
        const invalidDimension = journey.verifiedDimensions.find(dimension => !checks.some(check =>
            check.dimension === dimension && check.passed === true && typeof check.detail === "string" && check.detail.trim()));
        if (report.schemaVersion !== 1 || report.journeyId !== journey.journeyId || report.commit !== plan.commit || invalidDimension) {
            throw new Error(`Browser acceptance report is invalid for ${journey.journeyId}${invalidDimension ? `: ${invalidDimension}` : ""}.`);
        }
        return { journey, durationMs: Date.now() - startedAt, artifacts,
            verifiedDimensions: journey.verifiedDimensions, passed: true };
    }
}

export class CommandNativeJourneyRuntime implements NativeJourneyRuntime {
    constructor(private readonly protectedEnvironment = new ProtectedEnvironmentResolver()) {}

    async run(plan: FunctionalAcceptancePlan, journey: NativeJourneyPlan,
        runtimeEnvironment?: NodeJS.ProcessEnv): Promise<NativeJourneyObservation> {
        if (!journey.command.command.trim()) throw new Error(`Native journey ${journey.journeyId} has no executable command.`);
        const commands = (plan.nativeJourneys ?? []).map(item => item.command);
        const environment = runtimeEnvironment ?? await this.protectedEnvironment.resolve(
            [plan.launch, ...commands], plan.protectedEnvironmentFiles);
        const startedAt = Date.now();
        try {
            await runBoundedCommand(journey.command, plan.workingDirectory, environment, 300_000);
        } catch (error) {
            const failure = error as BoundedCommandFailure;
            let output = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`.trim().slice(-20_000);
            for (const name of journey.command.requiredEnvironmentVariables ?? []) {
                const secret = environment[name];
                if (secret) output = output.replaceAll(secret, "[REDACTED]");
            }
            output = output.replace(/(token|secret|password|authorization)=?\s*[^\s]+/gi, "$1=[REDACTED]");
            throw new Error(`Native journey command failed for ${journey.journeyId}` +
                `${failure.timedOut ? ` (timed out after ${journey.command.timeoutMs ?? 300_000}ms)` :
                    failure.code === undefined ? "" : ` (exit ${failure.code})`}${output ? `\n${output}` : ""}`);
        }
        const artifacts = [...new Set([...journey.artifacts, journey.acceptanceArtifact])];
        for (const artifact of artifacts) {
            const artifactPath = governedPath(plan.workingDirectory, artifact, "Native journey evidence");
            const metadata = await stat(artifactPath);
            if (!metadata.isFile() || metadata.size === 0) throw new Error(`Native journey evidence is missing or empty: ${artifact}`);
        }
        const report = JSON.parse(await readFile(governedPath(plan.workingDirectory, journey.acceptanceArtifact,
            "Native acceptance report"), "utf8")) as {
            schemaVersion?: unknown; journeyId?: unknown; commit?: unknown; platforms?: readonly unknown[];
            checks?: readonly { dimension?: unknown; passed?: unknown; detail?: unknown }[];
        };
        const platforms = Array.isArray(report.platforms) ? report.platforms : [];
        const checks = Array.isArray(report.checks) ? report.checks : [];
        const missingPlatform = journey.platforms.find(platform => !platforms.includes(platform));
        const invalidDimension = journey.verifiedDimensions.find(dimension => !checks.some(check =>
            check.dimension === dimension && check.passed === true && typeof check.detail === "string" && check.detail.trim()));
        if (report.schemaVersion !== 1 || report.journeyId !== journey.journeyId || report.commit !== plan.commit ||
            missingPlatform || invalidDimension) {
            throw new Error(`Native acceptance report is invalid for ${journey.journeyId}` +
                `${missingPlatform ? `: ${missingPlatform}` : invalidDimension ? `: ${invalidDimension}` : ""}.`);
        }
        return { journey, durationMs: Date.now() - startedAt, artifacts,
            verifiedDimensions: journey.verifiedDimensions, passed: true };
    }
}

export class FunctionalApplicationRuntime {
    constructor(private readonly launcher: ApplicationLauncher = new NodeApplicationLauncher(),
        private readonly probes: RuntimeProbeRunner = new HttpRuntimeProbeRunner(),
        private readonly browser: BrowserJourneyRuntime = new CommandBrowserJourneyRuntime(),
        private readonly protectedEnvironment = new ProtectedEnvironmentResolver(),
        private readonly measureAvailableDiskBytes: AvailableDiskBytes = availableDiskBytes,
        private readonly native: NativeJourneyRuntime = new CommandNativeJourneyRuntime()) {}

    async execute(runId: string, plan: FunctionalAcceptancePlan,
        report: FunctionalRuntimeReporter = () => undefined): Promise<FunctionalRuntimeResult> {
        this.assertPlan(plan);
        const usesDeployedPreview = plan.previewDeployment?.browserTarget === "DEPLOYED_PREVIEW" && Boolean(plan.durablePreview);
        if (usesDeployedPreview) {
            const previewUrl = plan.durablePreview!.webUrl;
            plan = { ...plan, launch: { ...plan.launch, baseUrl: previewUrl },
                browserJourneys: plan.browserJourneys.map(journey => ({ ...journey, command: { ...journey.command,
                    publicEnvironment: { ...(journey.command.publicEnvironment ?? {}), PLAYWRIGHT_BASE_URL: previewUrl,
                        PBOS_ACCEPTANCE_COMMIT: plan.commit } } })) };
        }
        const repositoryRevision = (await promisify(execFile)("git", ["rev-parse", "HEAD"], {
            cwd: plan.workingDirectory, maxBuffer: 1024 * 1024
        })).stdout.trim();
        if (repositoryRevision !== plan.commit && !repositoryRevision.startsWith(plan.commit)) {
            throw new Error(`Functional runtime lineage mismatch: planned ${plan.commit}, checked out ${repositoryRevision}.`);
        }
        const availableBytes = await this.measureAvailableDiskBytes(plan.workingDirectory);
        const minimumFreeBytes = plan.minimumFreeBytes ?? 1024 * 1024 * 1024;
        if (availableBytes < minimumFreeBytes) {
            throw new Error(`Functional runtime requires ${minimumFreeBytes} free bytes but only ${availableBytes} are available.`);
        }
        const canonicalJourneys = plan.browserJourneys.filter(journey => journey.visualCanon);
        for (const journey of canonicalJourneys) await verifyVisualCanonContract(plan, journey);
        if (canonicalJourneys.length) report("VISUAL_CANON_VERIFIED", {
            total: canonicalJourneys.length,
            screens: canonicalJourneys.map(journey => journey.visualCanon!.screenId),
            manifests: canonicalJourneys.map(journey => journey.visualCanon!.manifestPath)
        });
        const prerequisites = await resolveFunctionalPrerequisites(plan);
        const preparationFloor = minimumFreeBytes +
            (prerequisites.some(isDependencyBootstrap) ? DEPENDENCY_PREPARATION_HEADROOM_BYTES : 0);
        if (availableBytes < preparationFloor) {
            throw new Error(`Functional dependency preparation requires ${preparationFloor} free bytes ` +
                `to preserve the ${minimumFreeBytes}-byte runtime reserve, but only ${availableBytes} are available.`);
        }
        const runtimeEnvironment = await this.protectedEnvironment.resolve(
            [...prerequisites, plan.launch, ...plan.browserJourneys.map(journey => journey.command),
                ...(plan.nativeJourneys ?? []).map(journey => journey.command)],
            plan.protectedEnvironmentFiles);
        for (const prerequisite of prerequisites) {
            const timeoutMs = prerequisite.timeoutMs ?? 300_000;
            try {
                await runBoundedCommand(prerequisite, plan.workingDirectory, runtimeEnvironment, 300_000);
            } catch (error) {
                const failure = error as BoundedCommandFailure;
                const protectedNames = prerequisite.requiredEnvironmentVariables ?? [];
                const output = redactFunctionalRuntimeOutput(
                    `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`.trim().slice(-8_000),
                    runtimeEnvironment, protectedNames);
                throw new Error(`Functional prerequisite failed: ${prerequisite.command} ${prerequisite.args.join(" ")}` +
                    `${failure.timedOut ? ` (timed out after ${timeoutMs}ms)` :
                        failure.code === undefined ? "" : ` (exit ${failure.code})`}` +
                    `${output ? `\n${output}` : ""}`);
            }
        }
        const postPreparationBytes = await this.measureAvailableDiskBytes(plan.workingDirectory);
        if (postPreparationBytes < minimumFreeBytes) {
            throw new Error(`Functional runtime exhausted its disk safety reserve during dependency preparation: ` +
                `${minimumFreeBytes} bytes are required but only ${postPreparationBytes} remain.`);
        }
        if (!usesDeployedPreview) await assertLocalLaunchExecutable(plan);
        report("PREREQUISITES_VERIFIED", { total: prerequisites.length,
            commands: prerequisites.map(item => `${item.command} ${item.args.join(" ")}`),
            recoveredFromDurablePlan: prerequisites.length > (plan.prerequisites?.length ?? 0) });
        const application = usesDeployedPreview
            ? { logs: () => "", stop: async () => undefined }
            : await this.launcher.launch(plan, runtimeEnvironment);
        try {
            report("APPLICATION_HEALTHY", { baseUrl: plan.launch.baseUrl, healthPath: plan.launch.healthPath });
            const probes: RuntimeProbeObservation[] = [];
            for (const probe of plan.probes) probes.push(await this.probes.run(plan, probe));
            const failedProbes = probes.filter(item => !item.passed).map(item => item.probe.probeId);
            if (failedProbes.length) throw new Error(`Functional runtime probes failed: ${failedProbes.join(", ")}.`);
            report("RUNTIME_PROBES_VERIFIED", { total: probes.length,
                passed: probes.filter(item => item.passed).length, probeIds: probes.map(item => item.probe.probeId) });
            const journeys: BrowserJourneyObservation[] = [];
            for (const journey of plan.browserJourneys) journeys.push(await this.browser.run(plan, journey, runtimeEnvironment));
            const failedJourneys = journeys.filter(item => !item.passed).map(item => item.journey.journeyId);
            if (failedJourneys.length) throw new Error(`Functional browser journeys failed: ${failedJourneys.join(", ")}.`);
            report("BROWSER_JOURNEYS_VERIFIED", { total: journeys.length,
                passed: journeys.filter(item => item.passed).length, journeyIds: journeys.map(item => item.journey.journeyId),
                viewports: [...new Set(plan.browserJourneys.flatMap(item => item.viewports))] });
            const nativeJourneys: NativeJourneyObservation[] = [];
            for (const journey of plan.nativeJourneys ?? []) {
                nativeJourneys.push(await this.native.run(plan, journey, runtimeEnvironment));
            }
            const failedNativeJourneys = nativeJourneys.filter(item => !item.passed).map(item => item.journey.journeyId);
            if (failedNativeJourneys.length) throw new Error(`Functional native journeys failed: ${failedNativeJourneys.join(", ")}.`);
            if (nativeJourneys.length) report("NATIVE_JOURNEYS_VERIFIED", { total: nativeJourneys.length,
                passed: nativeJourneys.filter(item => item.passed).length,
                journeyIds: nativeJourneys.map(item => item.journey.journeyId),
                platforms: [...new Set(nativeJourneys.flatMap(item => item.journey.platforms))] });
            const durablePreview = await this.verifyDurablePreview(plan);
            if (durablePreview) report("DURABLE_PREVIEW_VERIFIED", {
                webUrl: durablePreview.webUrl, mobileUrl: durablePreview.mobileUrl, label: durablePreview.label
            });
            return { probes, journeys, nativeJourneys, applicationLogs: application.logs(),
                evidence: this.evidence(plan, probes, journeys, nativeJourneys),
                preview: { previewId: `functional-preview:${runId}:${plan.commit}`, runId, repository: plan.repository,
                    branch: plan.branch, commit: plan.commit, status: durablePreview ? "READY" : "REQUESTED",
                    webUrl: durablePreview?.webUrl, mobileUrl: durablePreview?.mobileUrl,
                    routes: [...new Set(plan.browserJourneys.map(item => item.route))],
                    personas: [...new Set(plan.browserJourneys.map(item => item.persona))],
                    viewports: [...new Set(plan.browserJourneys.flatMap(item => item.viewports))],
                    screenshots: plan.browserJourneys.flatMap(item => item.screenshotArtifacts), generatedAt: new Date().toISOString(),
                    label: durablePreview?.label ?? "SIMULATED" } };
        } catch (error) {
            const protectedNames = [
                ...prerequisites.flatMap(command => command.requiredEnvironmentVariables ?? []),
                ...(plan.launch.requiredEnvironmentVariables ?? []),
                ...plan.browserJourneys.flatMap(journey => journey.command.requiredEnvironmentVariables ?? []),
                ...(plan.nativeJourneys ?? []).flatMap(journey => journey.command.requiredEnvironmentVariables ?? [])
            ];
            const logs = redactFunctionalRuntimeOutput(application.logs(), runtimeEnvironment, protectedNames)
                .trim().slice(-20_000);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${message}${logs ? `\nRedacted application logs:\n${logs}` : ""}`, { cause: error });
        } finally {
            await application.stop();
        }
    }

    private evidence(plan: FunctionalAcceptancePlan, probes: readonly RuntimeProbeObservation[],
        journeys: readonly BrowserJourneyObservation[],
        nativeJourneys: readonly NativeJourneyObservation[]): readonly ApplicationAcceptanceEvidence[] {
        const evidence: ApplicationAcceptanceEvidence[] = probes.map(item => ({ evidenceId: `runtime:${item.probe.probeId}:${plan.commit}`,
            dimension: item.probe.dimension, behavior: item.probe.behavior, repository: plan.repository, commit: plan.commit,
            artifact: `${plan.launch.baseUrl}${item.probe.path}`, passed: item.passed, source: "RUNTIME_PROBE" as const }));
        for (const item of journeys) {
            evidence.push({ evidenceId: `browser-ui:${item.journey.journeyId}:${plan.commit}`, dimension: "USER_INTERFACE",
                behavior: item.journey.behavior, repository: plan.repository, commit: plan.commit,
                artifact: item.journey.screenshotArtifacts.join(","), passed: item.passed, source: "BROWSER_JOURNEY" });
            evidence.push({ evidenceId: `browser-journey:${item.journey.journeyId}:${plan.commit}`, dimension: "ACCEPTANCE_TEST",
                behavior: item.journey.behavior, repository: plan.repository, commit: plan.commit,
                artifact: item.journey.traceArtifact, passed: item.passed, source: "BROWSER_JOURNEY" });
            evidence.push({ evidenceId: `browser-a11y:${item.journey.journeyId}:${plan.commit}`, dimension: "ACCESSIBILITY",
                behavior: `${item.journey.behavior} passed browser accessibility validation.`, repository: plan.repository,
                commit: plan.commit, artifact: item.journey.accessibilityArtifact, passed: item.passed, source: "ACCESSIBILITY_AUDIT" });
            for (const dimension of item.verifiedDimensions) evidence.push({
                evidenceId: `browser-${dimension.toLowerCase()}:${item.journey.journeyId}:${plan.commit}`, dimension,
                behavior: `${item.journey.behavior} verified ${dimension.toLowerCase().replaceAll("_", " ")} through executable browser acceptance.`,
                repository: plan.repository, commit: plan.commit, artifact: item.journey.acceptanceArtifact,
                passed: item.passed, source: "BROWSER_JOURNEY"
            });
        }
        for (const item of nativeJourneys) {
            for (const dimension of item.verifiedDimensions) evidence.push({
                evidenceId: `native-${dimension.toLowerCase()}:${item.journey.journeyId}:${plan.commit}`, dimension,
                behavior: `${item.journey.behavior} verified ${dimension.toLowerCase().replaceAll("_", " ")} on ${item.journey.platforms.join(" and ")}.`,
                repository: plan.repository, commit: plan.commit, artifact: item.journey.acceptanceArtifact,
                passed: item.passed, source: dimension === "ACCESSIBILITY" ? "ACCESSIBILITY_AUDIT" : "NATIVE_JOURNEY"
            });
        }
        if (plan.durablePreview) evidence.push({ evidenceId: `preview:${plan.commit}`, dimension: "PREVIEW",
            behavior: "The exact application revision is live and interactive on durable desktop and mobile preview URLs.",
            repository: plan.repository, commit: plan.commit,
            artifact: `${plan.durablePreview.webUrl},${plan.durablePreview.mobileUrl}`, passed: true, source: "PREVIEW_PROBE" });
        return evidence;
    }

    private assertPlan(plan: FunctionalAcceptancePlan): void {
        new DistributedPlatformGraph().assertTopology();
        if (!plan.planId || !plan.systemId || !plan.productNodeId || !plan.journeyId || !plan.repository.includes("/") ||
            !exactRevision.test(plan.commit) || !plan.workingDirectory.startsWith("/") || plan.probes.length === 0 ||
            plan.browserJourneys.length === 0 || plan.launch.startupTimeoutMs < 1 ||
            plan.browserJourneys.some(journey => !journey.viewports.includes("DESKTOP_1440X900") ||
                !journey.viewports.includes("MOBILE_390X844") || journey.screenshotArtifacts.length < 2 ||
                !journey.acceptanceArtifact || journey.verifiedDimensions.length === 0)) {
            throw new Error("Functional acceptance plan is incomplete or lacks exact lineage.");
        }
        if ((plan.nativeJourneys ?? []).some(journey => !journey.platforms.includes("IOS") ||
            !journey.platforms.includes("ANDROID") || journey.artifacts.length === 0 ||
            !journey.acceptanceArtifact || journey.verifiedDimensions.length === 0)) {
            throw new Error("Native functional acceptance must prove both iOS and Android with exact-revision artifacts.");
        }
        const base = new URL(plan.launch.baseUrl);
        if (!["http:", "https:"].includes(base.protocol)) throw new Error("Functional application runtime requires an HTTP or HTTPS base URL.");
        if (plan.durablePreview) {
            const urls = [plan.durablePreview.webUrl, plan.durablePreview.mobileUrl,
                plan.durablePreview.iosUrl, plan.durablePreview.androidUrl].filter((value): value is string => Boolean(value));
            if (!urls.map(value => new URL(value).protocol).every(protocol => ["http:", "https:"].includes(protocol))) {
                throw new Error("Durable application previews require HTTP or HTTPS URLs.");
            }
        }
    }

    private async verifyDurablePreview(plan: FunctionalAcceptancePlan): Promise<FunctionalAcceptancePlan["durablePreview"]> {
        if (!plan.durablePreview) return undefined;
        const targets = [
            { url: plan.durablePreview.webUrl, path: plan.durablePreview.healthPath },
            { url: plan.durablePreview.mobileUrl,
                path: plan.durablePreview.mobileHealthPath ?? plan.durablePreview.healthPath }
        ];
        for (const target of targets) {
            const probeUrl = target.path ? new URL(target.path, target.url) : new URL(target.url);
            const response = await fetch(probeUrl, {
                signal: AbortSignal.timeout(10_000)
            });
            if (!response.ok) throw new Error(`Durable preview is not healthy: ${target.url} returned HTTP ${response.status}.`);
        }
        return plan.durablePreview;
    }
}
