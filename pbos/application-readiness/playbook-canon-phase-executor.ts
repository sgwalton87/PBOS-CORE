import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { CommandRunner, GitHubRepositoryGateway, governedBuildReference, NodeCommandRunner, PullRequestReference } from "../platform";
import { ApplicationAcceptanceDimension, ApplicationAcceptanceEvidence, FunctionalAcceptancePlan,
    ProductionMissionExecutor } from "../production-runtime";
import { ResumableRemediationEngine } from "../validation-automation";
import { playbookScholarProtectedEnvironmentFiles } from "./playbook-functional-acceptance";
import { PLAYBOOK_CANON_SOURCES } from "./playbook-canon-product-graph";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const MASTER_CHECKLIST = "docs/MASTER_CHECKLIST.md";
const requiredDimensions: readonly ApplicationAcceptanceDimension[] = ["ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY",
    "PBOS_INTEGRATION", "ACCEPTANCE_TEST", "ACCESSIBILITY", "SECURITY"];
const browserVerifiedDimensions = ["ROUTE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION", "SECURITY"] as const;

export interface CanonPhaseImplementationRequest { readonly missionId: string; readonly title: string; readonly rationale: string;
    readonly repository: string; readonly revision: string; readonly workingDirectory: string; readonly manifestPath: string; }
export interface CanonPhaseImplementationAgent { execute(request: CanonPhaseImplementationRequest): Promise<Readonly<{ summary: string }>>; }

export class CodexCanonPhaseImplementationAgent implements CanonPhaseImplementationAgent {
    constructor(private readonly commands: CommandRunner = new NodeCommandRunner()) {}
    async execute(request: CanonPhaseImplementationRequest): Promise<Readonly<{ summary: string }>> {
        const journeyId = request.missionId.toUpperCase();
        const artifactRoot = `artifacts/pbos-acceptance/${request.missionId}`;
        const prompt = `You are the bounded PBOS implementation worker for ${request.repository}@${request.revision}.
Read AGENTS.md, CODEX.md, and every canonical authority below completely before editing:
${PLAYBOOK_CANON_SOURCES.map(path => `- ${path}`).join("\n")}
Execute only mission ${request.missionId}: ${request.title}.
Reason: ${request.rationale}
Select the highest-priority dependency-complete group of unfinished checklist items in this phase that forms one cohesive, reviewable work package. Implement its actual application behavior end to end. Reuse existing architecture; do not create parallel runtimes, demo data, placeholders, false completion, secrets, production deployment, or unrelated changes.
Run the repository's lint, tests, build, and relevant browser/mobile acceptance. Do not commit, push, open a PR, merge, or deploy.
Create or update one Playwright acceptance spec that exercises real desktop and mobile behavior. When PBOS later runs it with PBOS_ACCEPTANCE_COMMIT, it must create these nonempty exact-revision artifacts:
- ${artifactRoot}-desktop.png
- ${artifactRoot}-mobile.png
- ${artifactRoot}-trace.zip
- ${artifactRoot}-accessibility.json
- ${artifactRoot}.json with {"schemaVersion":1,"journeyId":"${journeyId}","commit":process.env.PBOS_ACCEPTANCE_COMMIT,"checks":[{"dimension":"ROUTE","passed":true,"detail":"executed evidence"}, ...]} for ROUTE, DURABLE_DATA, AUTHORITY, PBOS_INTEGRATION, and SECURITY.
Update only the checklist items proven by this package and recalculate the phase percentage honestly. Do not mark the whole phase 100% unless no unfinished items remain. Write ${request.manifestPath} as JSON with:
{"schemaVersion":1,"missionId":"${request.missionId}","completionClaim":true,"completedItems":["exact checklist item"],"remainingItems":["still unfinished"],"routes":["/concrete-route"],"browserSpec":"tests/acceptance/spec.ts","acceptance":[{"dimension":"ROUTE","behavior":"specific behavior","artifact":"path","source":"IMPLEMENTATION"}]}
completionClaim means this bounded package—not the whole phase—is complete. completedItems must be nonempty and must exactly match checklist items moved to complete. Acceptance must contain all of: ${requiredDimensions.join(", ")}. Every artifact must exist. If no cohesive package can be completed, leave completionClaim false and explain blockers in the manifest. Never claim evidence you did not execute.`;
        const result = await this.commands.run("codex", ["exec", "--ephemeral", "--sandbox", "workspace-write", "--color", "never",
            "--cd", request.workingDirectory, prompt], request.workingDirectory, { timeoutMs: 45 * 60 * 1000 });
        return { summary: result.stdout.slice(-20_000) };
    }
}

interface PhaseManifest { readonly schemaVersion: 1; readonly missionId: string; readonly completionClaim: boolean;
    readonly completedItems: readonly string[]; readonly remainingItems: readonly string[];
    readonly routes: readonly string[]; readonly browserSpec: string; readonly acceptance: readonly Readonly<{
        dimension: ApplicationAcceptanceDimension; behavior: string; artifact: string;
        source: ApplicationAcceptanceEvidence["source"]; }>[]; readonly blockers?: readonly string[]; }

export interface PlaybookCanonPhaseExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway; readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession; readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
    readonly agent?: CanonPhaseImplementationAgent; readonly commands?: CommandRunner;
}

function changedPaths(status: string): readonly string[] {
    return status.split(/\r?\n/).filter(Boolean).map(line => line.slice(3).split(" -> ").at(-1)!.trim());
}

function assertSafePaths(paths: readonly string[]): void {
    const forbidden = paths.find(path => /(^|\/)(\.env($|\.)|node_modules|\.next|secrets?)(\/|$)/i.test(path));
    if (forbidden) throw new Error(`Canon phase worker changed a protected path: ${forbidden}.`);
}

function publishablePath(path: string): boolean {
    return path !== "next-env.d.ts" && !/^(artifacts\/|\.next\/|\.vercel\/|playwright-report\/|test-results\/)/.test(path);
}

function phaseItems(source: string, missionId: string): ReadonlyMap<string, string> {
    const phaseNumber = Number.parseInt(missionId.slice(-2), 10);
    const start = source.search(new RegExp(`^# Phase ${phaseNumber} — `, "m"));
    if (start < 0) throw new Error(`Canon phase ${phaseNumber} is missing from ${MASTER_CHECKLIST}.`);
    const rest = source.slice(start);
    const next = rest.slice(1).search(/^# Phase \d+ — /m);
    const section = next < 0 ? rest : rest.slice(0, next + 1);
    return new Map([...section.matchAll(/^- ([⬜🟨🟦🟥🟩])\s+(.+)$/gmu)].map(match => [match[2].trim(), match[1]]));
}

function assertChecklistTransition(before: string, after: string, missionId: string, manifest: PhaseManifest): void {
    const prior = phaseItems(before, missionId); const current = phaseItems(after, missionId);
    const declared = new Set(manifest.completedItems);
    const newlyComplete = [...current].filter(([item, status]) => status === "🟩" && prior.get(item) !== "🟩").map(([item]) => item);
    const invalid = manifest.completedItems.find(item => !prior.has(item) || prior.get(item) === "🟩" || current.get(item) !== "🟩");
    if (invalid || newlyComplete.length !== declared.size || newlyComplete.some(item => !declared.has(item))) {
        throw new Error(`Canon phase checklist transition does not match completedItems${invalid ? `: ${invalid}` : ""}.`);
    }
    const actualRemaining = [...current].filter(([, status]) => status !== "🟩").map(([item]) => item).sort();
    const declaredRemaining = [...manifest.remainingItems].sort();
    if (JSON.stringify(actualRemaining) !== JSON.stringify(declaredRemaining)) {
        throw new Error("Canon phase remainingItems do not match the governed checklist.");
    }
}

function safeArtifactPath(workingDirectory: string, path: string): string {
    if (!path.trim() || isAbsolute(path)) throw new Error(`Canon phase evidence path is invalid: ${path || "EMPTY"}.`);
    const target = resolve(workingDirectory, path);
    const inside = relative(workingDirectory, target);
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new Error(`Canon phase evidence escaped the repository: ${path}.`);
    return target;
}

async function assertManifestArtifacts(manifest: PhaseManifest, workingDirectory: string): Promise<void> {
    const artifacts = [...manifest.acceptance.map(item => item.artifact), manifest.browserSpec];
    for (const artifact of artifacts) {
        const metadata = await stat(safeArtifactPath(workingDirectory, artifact));
        if (!metadata.isFile() || metadata.size === 0) throw new Error(`Canon phase evidence is missing or empty: ${artifact}.`);
    }
}

export function playbookCanonPhaseExecutor(dependencies: PlaybookCanonPhaseExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (!/^048-phase-\d{2}$/.test(context.mission.missionId) || context.run.systemId !== SYSTEM_ID || context.run.repository !== REPOSITORY) {
            throw new Error("The Playbook canon phase adapter is restricted to phase missions.");
        }
        if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) throw new Error("Session does not authorize Playbook phase execution.");
        const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, context.run.startingBranch);
        const branch = `agent/pbos-playbook-system-001-${context.mission.missionId}-${context.run.runId.slice(0, 8)}`;
        for (const [action, risk] of [["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"], ["MODIFY_APPLICATION_CODE", "MEDIUM"],
            ["CREATE_TESTS", "MEDIUM"], ["UPDATE_DOCUMENTATION", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"], ["PUSH_BRANCH", "MEDIUM"],
            ["OPEN_DRAFT_PR", "MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]) {
            const decision = dependencies.authorize(action, risk, branch); if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) throw new Error("Governed Playbook revision advanced; re-plan phase execution.");
        const checklistBefore = await dependencies.gateway.readFileAtRevision(reference, MASTER_CHECKLIST, inspection.revision);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        const workingDirectory = await dependencies.gateway.workingDirectory(reference);
        const manifestPath = `pbos/readiness/${context.mission.missionId}.json`;
        context.report("IMPLEMENTING", `PBOS implementation worker is executing ${context.mission.title} inside ${branch}.`);
        const agent = dependencies.agent ?? new CodexCanonPhaseImplementationAgent();
        const heartbeat = setInterval(() => context.report("IMPLEMENTING",
            `${context.mission.title} is still executing inside the governed Playbook checkout.`), 30_000);
        let agentResult: Readonly<{ summary: string }>;
        try {
            agentResult = await agent.execute({ missionId: context.mission.missionId, title: context.mission.title,
                rationale: context.mission.rationale, repository: REPOSITORY, revision: inspection.revision, workingDirectory, manifestPath });
        } finally { clearInterval(heartbeat); }
        const commands = dependencies.commands ?? new NodeCommandRunner();
        const paths = changedPaths((await commands.run("git", ["status", "--porcelain"], workingDirectory)).stdout);
        assertSafePaths(paths);
        const publishablePaths = paths.filter(publishablePath);
        if (!publishablePaths.includes(manifestPath)) throw new Error(`Implementation worker did not produce ${manifestPath}.`);
        const manifest = JSON.parse(await readFile(join(workingDirectory, manifestPath), "utf8")) as PhaseManifest;
        if (manifest.schemaVersion !== 1 || manifest.missionId !== context.mission.missionId || !manifest.completionClaim) {
            throw new Error(`Canon phase remains incomplete: ${(manifest.blockers ?? ["completion claim withheld"]).join(", ")}.`);
        }
        const dimensions = new Set(manifest.acceptance.map(item => item.dimension));
        const missing = requiredDimensions.filter(dimension => !dimensions.has(dimension));
        if (missing.length || !manifest.completedItems?.length || !Array.isArray(manifest.remainingItems) ||
            !manifest.routes.length || !manifest.browserSpec || !paths.length ||
            manifest.routes.some(route => !route.startsWith("/") || route.includes("[") || route.includes("]"))) {
            throw new Error(`Canon phase evidence contract incomplete: ${missing.join(", ")}.`);
        }
        await assertManifestArtifacts(manifest, workingDirectory);
        const checklistAfter = await readFile(join(workingDirectory, MASTER_CHECKLIST), "utf8");
        assertChecklistTransition(checklistBefore, checklistAfter, context.mission.missionId, manifest);
        const substantive = publishablePaths.filter(path => path !== manifestPath && path !== MASTER_CHECKLIST);
        if (!substantive.length) throw new Error("Canon phase worker produced no substantive implementation or acceptance-test change.");
        const revision = await dependencies.gateway.commit(reference, `feat: advance ${context.mission.title}`, publishablePaths);
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            `feat: advance ${context.mission.title}`, `PBOS canon phase \`${context.mission.missionId}\` advanced one bounded package at \`${inspection.revision}\`: ${manifest.completedItems.join(", ")}. ${manifest.remainingItems.length} checklist item(s) remain. PBOS owns independent validation and certification.\n\nGenerated revision: \`${revision}\`.`);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        const acceptanceEvidence: readonly ApplicationAcceptanceEvidence[] = manifest.acceptance.map(item => ({ ...item,
            evidenceId: `${context.mission.missionId}:${item.dimension.toLowerCase()}:${revision}`, repository: REPOSITORY,
            commit: revision, passed: true }));
        const baseUrl = "http://127.0.0.1:4319";
        const functionalAcceptancePlan: FunctionalAcceptancePlan = { planId: `${context.mission.missionId}:${revision}`,
            systemId: SYSTEM_ID, productNodeId: context.mission.missionId, journeyId: context.mission.missionId.toUpperCase(),
            repository: REPOSITORY, branch, commit: revision, workingDirectory,
            protectedEnvironmentFiles: playbookScholarProtectedEnvironmentFiles(workingDirectory), minimumFreeBytes: 1024 * 1024 * 1024,
            prerequisites: [{ command: "npm", args: ["ci", "--no-audit", "--no-fund"], timeoutMs: 600_000 }],
            launch: { command: "npm", args: ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "4319"], baseUrl,
                healthPath: manifest.routes[0], startupTimeoutMs: 120_000 },
            probes: manifest.routes.map((path, index) => ({ probeId: `${context.mission.missionId}-route-${index + 1}`,
                dimension: "ROUTE" as const, behavior: `${context.mission.title} exposes ${path}.`, path, expectedStatus: 200 })),
            browserJourneys: [{ journeyId: context.mission.missionId.toUpperCase(), persona: "canonical Playbook user",
                behavior: `${context.mission.title} works with real authority and durable state on desktop and mobile.`,
                route: manifest.routes[0], engine: "PLAYWRIGHT",
                command: { command: "npx", args: ["playwright", "test", manifest.browserSpec, "--project=chromium"],
                    publicEnvironment: { PLAYWRIGHT_BASE_URL: baseUrl, PBOS_ACCEPTANCE_COMMIT: revision } },
                viewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
                screenshotArtifacts: [`artifacts/pbos-acceptance/${context.mission.missionId}-desktop.png`, `artifacts/pbos-acceptance/${context.mission.missionId}-mobile.png`],
                traceArtifact: `artifacts/pbos-acceptance/${context.mission.missionId}-trace.zip`,
                accessibilityArtifact: `artifacts/pbos-acceptance/${context.mission.missionId}-accessibility.json`,
                acceptanceArtifact: `artifacts/pbos-acceptance/${context.mission.missionId}.json`,
                verifiedDimensions: browserVerifiedDimensions }] };
        return { outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId }, evidenceIds: [`commit:${revision}`, `pull-request:${pullRequest.number}`],
            files: { modified: publishablePaths }, commands: [{ command: "bounded PBOS implementation worker", exitCode: 0, durationMs: 0, output: agentResult.summary }],
            validations: [{ name: "Bounded canon phase increment published for independent validation", passed: true, durationMs: 0, evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url }, acceptanceEvidence, functionalAcceptancePlan };
    };
}
