import { randomUUID, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import type { GenesisStateRepository, OperatorIdentityService } from "../genesis-state";
import type { VerifiableApproval } from "../genesis-state/operator-identity";
import type { ProductionMissionRequest } from "../production-runtime/production-mission-runner";
import type { DisposableCodexContext, Mb03Mission } from "./mb03-disposable-mission";
import { CodexCanonPhaseImplementationAgent } from "../application-readiness/playbook-canon-phase-executor";
import { evidenceDigest, evidenceGitSha, evidenceJson, evidenceSha256, evidenceSignatureInput, remoteKeyFingerprint } from "./remote-attestation";
import type { SignedRemoteEvidence } from "./remote-attestation";
import { CANARY_AFTER, CANARY_BEFORE, CANARY_PATH, CANARY_REPOSITORY, createRemoteCanaryMission } from "./remote-canary";
import type { GcsRemoteDispatchJournal } from "./remote-dispatch-journal";
import type { HttpsModelLeaseIssuer, ScopedModelLease } from "./remote-model-credential";
import { MAX_REMOTE_TTL_MS, REMOTE_DISPOSAL_DOMAIN, REMOTE_PROVISION_DOMAIN, REMOTE_RETURN_DOMAIN, runTrustedRemoteMission } from "./trusted-remote-worker";
import type { RemoteDisposal, RemoteProvision, RemoteReturn, RemoteWorkerBinding, RemoteWorkerTrust, TrustedRemoteWorkerProvider } from "./trusted-remote-worker";

const ROOT = "/var/lib/pbos-canary";
const WORKTREE = ROOT + "/worktree";
const HOME = ROOT + "/home";
const CODEX_HOME = HOME + "/codex";
const SCRATCH = ROOT + "/scratch";
const USER = "pboscanary";
const CODEX = "/usr/local/bin/codex";

const BOOTSTRAP = String.raw`
import hashlib, os, pathlib, stat, subprocess, sys
source, root, worktree, home, codex_home, scratch, user, path, origin, sha, codex, binary_hash, expected = sys.argv[1:]
def run(*args):
    return subprocess.check_output(args, text=True).strip()
def git(*args):
    return run("git", "-c", "safe.directory="+source, "-c", "safe.directory="+worktree,
        "-c", "core.hooksPath=/dev/null", *args)
if os.geteuid() != 0 or os.path.realpath(source) != source or git("-C", source, "rev-parse", "HEAD") != sha:
    raise SystemExit("unexpected source or init identity")
if git("-C", source, "remote", "get-url", "origin").removesuffix(".git") != origin:
    raise SystemExit("unexpected source origin")
if hashlib.sha256(pathlib.Path(codex).read_bytes()).hexdigest() != binary_hash:
    raise SystemExit("unexpected codex binary")
os.mkdir(root, 0o755)
run("useradd", "--no-create-home", "--home-dir", home, "--shell", "/usr/sbin/nologin", user)
uid = int(run("id", "-u", user))
gid = int(run("id", "-g", user))
if run("id", "-G", user) != str(gid) or uid == 0:
    raise SystemExit("unexpected worker privileges")
git("-C", source, "worktree", "add", "--detach", worktree, sha)
run("git", "config", "--system", "--add", "safe.directory", worktree)
os.chown(source, 0, 0)
os.chmod(source, 0o700)
for directory, folders, files in os.walk(worktree, followlinks=False):
    os.chown(directory, 0, 0)
    os.chmod(directory, 0o755)
    for item in folders + files:
        target = os.path.join(directory, item)
        info = os.lstat(target)
        if stat.S_ISLNK(info.st_mode):
            raise SystemExit("symlinks are unsupported in canary source")
        if stat.S_ISREG(info.st_mode):
            os.chown(target, 0, 0)
            os.chmod(target, 0o755 if info.st_mode & 0o111 else 0o644)
target = os.path.join(worktree, path)
info = os.lstat(target)
if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or pathlib.Path(target).read_text() != expected:
    raise SystemExit("unexpected canary input")
os.chown(target, uid, gid)
for directory in [home, codex_home, scratch]:
    os.mkdir(directory, 0o700)
    os.chown(directory, uid, gid)
# A non-root filesystem probe checks an allowed write permission and denied directory writes.
run("runuser", "-u", user, "--", "/usr/bin/test", "-w", target)
if subprocess.run(["runuser", "-u", user, "--", "/usr/bin/test", "-w", os.path.dirname(target)]).returncode != 1:
    raise SystemExit("worker can replace repository files")
if subprocess.run(["runuser", "-u", user, "--", "/usr/bin/test", "-r", source]).returncode != 1:
    raise SystemExit("worker can read administrative Git checkout")
`;

const COLLECT = String.raw`
import base64, os, pathlib, stat, subprocess, sys
root, relative, sha, expected = sys.argv[1:]
def git(*args):
    return subprocess.check_output(["git", "-c", "safe.directory="+root, "-C", root, *args])
if git("rev-parse", "HEAD").strip().decode() != sha or git("rev-parse", "--abbrev-ref", "HEAD").strip() != b"HEAD":
    raise SystemExit("source revision changed")
if git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored") != b" M " + os.fsencode(relative) + b"\0":
    raise SystemExit("only the approved regular file may change")
target = os.path.join(root, relative)
if os.path.realpath(target) != target:
    raise SystemExit("noncanonical file path")
with os.fdopen(os.open(target, os.O_RDONLY | os.O_NOFOLLOW), "rb") as result:
    info = os.fstat(result.fileno())
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 1024:
        raise SystemExit("invalid output file")
    content = result.read(1025)
if content != expected.encode():
    raise SystemExit("unexpected canary output")
print(base64.b64encode(content).decode())
`;

interface VercelControlIdentity {
    readonly token: string;
    readonly teamId: string;
    readonly projectId: string;
}

export interface VercelCanaryPolicy {
    readonly providerId: string;
    readonly authorityId: string;
    readonly sourceSha: string;
    readonly workerId: string;
    readonly image: string;
    readonly codexBinaryDigest: string;
    readonly model: string;
    readonly teamId: string;
    readonly projectId: string;
    readonly credentials: () => Promise<VercelControlIdentity>;
    readonly signer: KeyObject;
    readonly dispatch: Pick<GcsRemoteDispatchJournal, "reserve">;
    readonly modelLeases: Pick<HttpsModelLeaseIssuer, "modelOrigin" | "issue" | "revoke">;
}

type Vm = Awaited<ReturnType<typeof Sandbox.create>>;
type SandboxApi = Pick<typeof Sandbox, "create" | "get">;

async function bootstrap(vm: Vm, sha: string, codexBinaryDigest: string, signal: AbortSignal) {
    const result = await vm.runCommand({ cmd: "python3", sudo: true, signal, args: ["-I", "-c", BOOTSTRAP,
        "/opt/pbos-source", ROOT, WORKTREE, HOME, CODEX_HOME, SCRATCH, USER, CANARY_PATH,
        `https://github.com/${CANARY_REPOSITORY}`, sha, CODEX, codexBinaryDigest, CANARY_BEFORE] });
    if (result.exitCode !== 0) throw new Error("Vercel Sandbox source, binary, or write boundary could not be verified.");
}

export interface VercelCanaryReadinessInput extends VercelControlIdentity {
    readonly sourceSha: string;
    readonly image: string;
    readonly codexBinaryDigest: string;
}

function isCanaryImage(image: string) { return /^[a-z0-9][a-z0-9./_-]*@sha256:[a-f0-9]{64}$/.test(image); }

function createSandbox(api: SandboxApi, input: VercelCanaryReadinessInput, name: string, timeout: number, signal: AbortSignal) {
    const { image, token, teamId, projectId } = input;
    return api.create({ image, token, teamId, projectId, name,
        // Source is already sealed into the reviewed immutable image. Do not ask\n        // Vercel to clone through deny-all network policy at startup.
        timeout, persistent: false, ports: [], resources: { vcpus: 1 }, networkPolicy: "deny-all", signal });
}

/** Explicit non-dispatch probe. No journal entry, model credential or Codex process is created. */
export async function probeVercelCanary(input: VercelCanaryReadinessInput, signal: AbortSignal, api: SandboxApi = Sandbox) {
    if (!input.token || /\s/.test(input.token) || !/^team_[A-Za-z0-9]+$/.test(input.teamId) ||
        !/^prj_[A-Za-z0-9]+$/.test(input.projectId) || !isCanaryImage(input.image) ||
        !evidenceGitSha(input.sourceSha) || !evidenceSha256(input.codexBinaryDigest)) {
        throw new Error("Dedicated Vercel controller identity, source and image pins are required.");
    }
    signal.throwIfAborted();
    const vm = await createSandbox(api, input, `pbos-readiness-${randomUUID()}`, 60_000, signal);
    try {
        if (vm.persistent || vm.image !== input.image || vm.status !== "running") {
            throw new Error("Readiness sandbox returned an unexpected image or persistence state.");
        }
        await bootstrap(vm, input.sourceSha, input.codexBinaryDigest, signal);
        const check = await vm.runCommand({ cmd: "curl", args: ["-sS", "--max-time", "4", "--fail", "https://example.com/"],
            timeoutMs: 6000, signal });
        // DNS, connection or timeout failure is expected. A missing binary or HTTP response is not evidence.
        if (![6, 7, 28].includes(check.exitCode)) throw new Error("Readiness sandbox did not confirm blocked outbound traffic.");
    } finally {
        const sandboxId = vm.currentSession().sessionId;
        const stopped = await vm.stop({ signal: AbortSignal.timeout(15_000) });
        if (stopped.status !== "stopped" || stopped.id !== sandboxId || stopped.snapshot) {
            throw new Error("Readiness sandbox teardown was not confirmed.");
        }
    }
    return { status: "READY_WITHOUT_MODEL", sourceSha: input.sourceSha } as const;
}

interface Attempt {
    bindingDigest: string;
    sandbox?: Vm;
    create?: Promise<Vm>;
    model?: Promise<ScopedModelLease>;
    executing: boolean;
    ready: boolean;
    disposed: boolean;
    disposal?: Promise<SignedRemoteEvidence<RemoteDisposal> | undefined>;
}

export class VercelCanaryProvider implements TrustedRemoteWorkerProvider {
    readonly mode = "isolated-remote" as const;
    readonly isolationProfile: string;
    private readonly attempts = new Map<string, Attempt>();

    constructor(private readonly policy: VercelCanaryPolicy, private readonly sandbox: SandboxApi = Sandbox) {
        if (!evidenceGitSha(policy.sourceSha) || !evidenceSha256(policy.codexBinaryDigest) ||
            !isCanaryImage(policy.image) ||
            !/^team_[A-Za-z0-9]+$/.test(policy.teamId) || !/^prj_[A-Za-z0-9]+$/.test(policy.projectId) ||
            !/^[A-Za-z0-9._-]+$/.test(policy.workerId) || !/^[a-zA-Z0-9][a-zA-Z0-9.-]+$/.test(policy.model) ||
            !/^[A-Za-z0-9._-]+$/.test(policy.providerId) || policy.signer.type !== "private" || policy.signer.asymmetricKeyType !== "ed25519") {
            throw new Error("Reviewed Vercel Sandbox controller policy is required.");
        }
        this.isolationProfile = evidenceDigest(evidenceJson({
            implementation: "pbos-vercel-canary-v1", image: policy.image, codex: policy.codexBinaryDigest, model: policy.model,
            teamId: policy.teamId, projectId: policy.projectId, broker: policy.modelLeases.modelOrigin, bootstrap: evidenceDigest(BOOTSTRAP),
            collector: evidenceDigest(COLLECT), egress: "broker-responses-post-only", persistent: false,
        }));
    }

    private async credentials() {
        const identity = await this.policy.credentials();
        if (identity.teamId !== this.policy.teamId || identity.projectId !== this.policy.projectId ||
            !identity.token || /\s/.test(identity.token)) throw new Error("Dedicated Vercel controller identity is unavailable.");
        return { teamId: identity.teamId, projectId: identity.projectId, token: identity.token };
    }

    private bind(binding: RemoteWorkerBinding): string {
        const { mission } = binding;
        const expected = createRemoteCanaryMission(this.policy.sourceSha, this.policy.workerId, mission.stateNamespace, mission.attemptId);
        if (binding.authorityId !== this.policy.authorityId || !evidenceSha256(binding.approvalDigest) ||
            !/^[a-f0-9-]{36}$/.test(binding.fence) || evidenceJson(mission) !== evidenceJson(expected)) {
            throw new Error("Vercel provider accepts only the approved disposable canary binding.");
        }
        return evidenceDigest(evidenceJson(binding));
    }

    private signed<T>(domain: string, payload: T) {
        return { payload, signature: sign(null, evidenceSignatureInput(domain, payload), this.policy.signer).toString("hex") };
    }

    private bootstrap(vm: Vm, sha: string, signal: AbortSignal) {
        return bootstrap(vm, sha, this.policy.codexBinaryDigest, signal);
    }

    async probe(signal: AbortSignal) {
        return probeVercelCanary({ ...await this.credentials(), sourceSha: this.policy.sourceSha,
            image: this.policy.image, codexBinaryDigest: this.policy.codexBinaryDigest }, signal, this.sandbox);
    }

    async provision(binding: RemoteWorkerBinding, signal: AbortSignal) {
        const bindingDigest = this.bind(binding);
        const deadline = Date.parse(binding.deadline);
        if (!(deadline - Date.now() >= 1000 && deadline - Date.now() <= MAX_REMOTE_TTL_MS) || this.attempts.has(binding.fence)) {
            throw new Error("Vercel provision refused an invalid or repeated lease.");
        }
        const attempt: Attempt = { bindingDigest, disposed: false, executing: false, ready: false };
        this.attempts.set(binding.fence, attempt);
        const identity = await this.credentials();
        signal.throwIfAborted();
        await this.policy.dispatch.reserve(binding, signal);
        signal.throwIfAborted();
        const timeout = deadline - Date.now() - 500;
        if (attempt.disposed || timeout < 1000) throw new Error("Vercel sandbox deadline elapsed before creation.");
        attempt.create = createSandbox(this.sandbox, { ...identity, sourceSha: this.policy.sourceSha,
            image: this.policy.image, codexBinaryDigest: this.policy.codexBinaryDigest }, `pbos-canary-${binding.fence}`, timeout, signal);
        const vm = attempt.sandbox = await attempt.create;
        const expiresAt = vm.expiresAt?.getTime() ?? NaN;
        if (vm.persistent || vm.image !== this.policy.image || vm.status !== "running" || !(expiresAt > Date.now() && expiresAt <= deadline)) {
            throw new Error("Vercel Sandbox lifecycle or image did not match the reviewed policy.");
        }
        await this.bootstrap(vm, binding.mission.sourceSha, signal);
        signal.throwIfAborted();
        if (attempt.disposed) throw new Error("Vercel sandbox disposed before credential issuance.");
        // The broker's scope is the original signed binding. Its lease will not outlive the sandbox.
        attempt.model = this.policy.modelLeases.issue(binding, signal);
        const model = await attempt.model;
        if (Date.parse(model.expiresAt) > expiresAt) {
            throw new Error("The scoped model credential outlives the Vercel session.");
        }
        signal.throwIfAborted();
        const modelHost = new URL(this.policy.modelLeases.modelOrigin).hostname;
        await vm.updateNetworkPolicy({ allow: { [modelHost]: [
            { match: { path: { exact: "/v1/responses" }, method: ["POST"] },
                transform: [{ headers: { Authorization: `Bearer ${model.token}` } }] },
            { response: { statusCode: 403 } },
        ] } }, { signal });
        signal.throwIfAborted();
        if (attempt.disposed) throw new Error("Vercel sandbox was disposed during provisioning.");
        attempt.ready = true;
        return this.signed<RemoteProvision>(REMOTE_PROVISION_DOMAIN, {
            providerId: this.policy.providerId, bindingDigest, sandboxId: vm.currentSession().sessionId,
            isolationProfile: this.isolationProfile, issuedAt: new Date().toISOString(), expiresAt: new Date(expiresAt).toISOString(),
            credentialExpiresAt: model.expiresAt,
        });
    }

    async execute(binding: RemoteWorkerBinding, _work: Readonly<{ title: string; rationale: string }>, signal: AbortSignal) {
        const bindingDigest = this.bind(binding);
        const attempt = this.attempts.get(binding.fence);
        if (!attempt?.ready || !attempt.sandbox || !attempt.model || attempt.bindingDigest !== bindingDigest || attempt.disposed || attempt.executing) {
            throw new Error("No authorized Vercel Sandbox dispatch is active.");
        }
        const vm = attempt.sandbox;
        const lease = await attempt.model;
        signal.throwIfAborted();
        if (attempt.executing || attempt.disposed) throw new Error("Vercel Sandbox dispatch is already used.");
        attempt.executing = true;
        const time = () => Math.min(Date.parse(binding.deadline), Date.parse(lease.expiresAt), vm.expiresAt?.getTime() ?? 0) - Date.now();
        if (time() < 1000) throw new Error("Vercel Sandbox execution credential is expired.");
        const providerConfig = ["--config", 'model_provider="pbos_broker"', "--config", `model=${JSON.stringify(this.policy.model)}`,
            "--config", 'model_providers.pbos_broker.name="PBOS scoped broker"',
            "--config", `model_providers.pbos_broker.base_url=${JSON.stringify(this.policy.modelLeases.modelOrigin + "/v1")}`,
            "--config", 'model_providers.pbos_broker.wire_api="responses"',
            "--config", "model_providers.pbos_broker.requires_openai_auth=false",
            "--config", "model_providers.pbos_broker.supports_websockets=false", "--config", 'web_search="disabled"'];
        const agent = new CodexCanonPhaseImplementationAgent({
            run: async (args) => {
                const result = await vm.runCommand({ cmd: "runuser", args: ["-u", USER, "--", "/usr/bin/env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin",
                    `HOME=${HOME}`, `CODEX_HOME=${CODEX_HOME}`, `TMPDIR=${SCRATCH}`, CODEX,
                    args[0], ...providerConfig, ...args.slice(1)], cwd: WORKTREE, sudo: true, timeoutMs: Math.max(1, time()), signal });
                if (result.exitCode !== 0) throw new Error("The Vercel Codex canary exited unsuccessfully.");
                return { stdout: "", stderr: "" };
            },
        });
        await agent.execute({ missionId: binding.mission.missionId, title: "Update the synthetic canary marker",
            rationale: `Replace the file contents with exactly ${JSON.stringify(CANARY_AFTER)}. Do not change other files.`,
            repository: CANARY_REPOSITORY, revision: binding.mission.sourceSha, workingDirectory: WORKTREE, manifestPath: "",
            disposableCore: { allowedPaths: [CANARY_PATH], home: HOME, codexHome: CODEX_HOME, temporaryDirectory: SCRATCH }, signal });
        signal.throwIfAborted();
        const collected = await vm.runCommand({ cmd: "python3", sudo: true, signal, args: ["-I", "-c", COLLECT,
            WORKTREE, CANARY_PATH, binding.mission.sourceSha, CANARY_AFTER] });
        if (collected.exitCode !== 0) throw new Error("The independent sandbox collector rejected the canary result.");
        const contentBase64 = (await collected.stdout()).trim();
        if (contentBase64 !== Buffer.from(CANARY_AFTER).toString("base64") || time() <= 0) {
            throw new Error("The canary result was unexpected or arrived after the deadline.");
        }
        const receipt = this.signed<RemoteReturn>(REMOTE_RETURN_DOMAIN, {
            providerId: this.policy.providerId, bindingDigest, sandboxId: vm.currentSession().sessionId,
            completedAt: new Date().toISOString(), status: "SUCCEEDED",
            outputsDigest: evidenceDigest(evidenceJson([{ path: CANARY_PATH, digest: evidenceDigest(CANARY_AFTER) }])),
        });
        return { receipt, files: [{ path: CANARY_PATH, contentBase64 }] };
    }

    async dispose(binding: RemoteWorkerBinding) {
        const bindingDigest = this.bind(binding);
        const attempt = this.attempts.get(binding.fence);
        if (!attempt || attempt.bindingDigest !== bindingDigest) return undefined;
        attempt.disposed = true;
        return attempt.disposal ??= (async () => {
            const signal = AbortSignal.timeout(15_000);
            const stop = async () => {
                if (!attempt.create) return undefined;
                const vm = await attempt.create.catch(async () => this.sandbox.get({
                    ...await this.credentials(), name: `pbos-canary-${binding.fence}`, resume: false, signal,
                }));
                const sandboxId = vm.currentSession().sessionId;
                const stopped = await vm.stop({ signal });
                if (stopped.status !== "stopped" || stopped.id !== sandboxId || stopped.snapshot) {
                    throw new Error("Vercel did not confirm disposal of the non-persistent session.");
                }
                return sandboxId;
            };
            const revoke = async () => {
                if (!attempt.model) return;
                // The broker must tombstone the fence even if the issuance request was interrupted.
                await this.policy.modelLeases.revoke(binding, signal);
            };
            const [sandboxId] = await Promise.all([stop(), revoke()]);
            if (!sandboxId) return undefined;
            return this.signed<RemoteDisposal>(REMOTE_DISPOSAL_DOMAIN, { providerId: this.policy.providerId, bindingDigest, sandboxId,
                disposedAt: new Date().toISOString(), status: "STOPPED_AND_REVOKED" });
        })();
    }
}

/** Controller entry. The existing runner consumes the legitimate operator approval before acquiring a remote lease. */
export function runVercelCanary(state: GenesisStateRepository, identities: OperatorIdentityService, mission: Mb03Mission,
    approval: VerifiableApproval, request: ProductionMissionRequest, context: DisposableCodexContext,
    policy: VercelCanaryPolicy, trust: RemoteWorkerTrust) {
    const provider = new VercelCanaryProvider(policy);
    if (trust.authorityId !== policy.authorityId || trust.providerId !== policy.providerId ||
        trust.isolationProfile !== provider.isolationProfile || trust.allowFixture ||
        remoteKeyFingerprint(policy.signer) !== remoteKeyFingerprint(trust.publicKey)) {
        throw new Error("Independent trust pins do not match the reviewed canary provider.");
    }
    return runTrustedRemoteMission(state, identities, mission, approval, request, context, provider, trust);
}
