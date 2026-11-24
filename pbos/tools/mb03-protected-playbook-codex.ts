/**
 * Protected Cloud Run entrypoint for MB-03 Playbook Codex missions.
 *
 * This is NOT the existing read-only pbos-genesis-admission observer job.
 * Requires a separately approved mb03 worker job, sealed canonical observation,
 * an existing private disposable state containing the reviewed queue, durable
 * Neon fencing, and mission-specific Ed25519 authorization.
 *
 * Never initializes state, signs approvals, creates cloud resources, or deploys.
 */
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { neon } from "@neondatabase/serverless";
import { GenesisStateRepository } from "../genesis-state";
import { ProductionRuntimeService } from "../production-runtime/production-runtime-service";
import { ProductionMissionRunner } from "../production-runtime/production-mission-runner";
import { inspectSealedAdmissionSnapshot } from "../production-runtime/sealed-admission-snapshot";
import { verifyPpsCanon } from "../boot/pps-canon-snapshot-verifier";
import { verifyHostedNeonReadiness } from "../production-runtime/hosted-neon-readiness";
import { composeHostedNeonExecutor } from "../production-runtime/hosted-neon-executor-composition";
import type { NeonLeaseSql } from "../production-runtime/neon-fenced-lease-provider";
import {
    executeHostedPlaybookCodexMission, type HostedPlaybookCodexComposition
} from "../production-runtime/hosted-playbook-codex-composition";
import { checkpointSealer } from "./mb03-hosted-executor";
import { VercelPlaybookProvider } from "../master-builder/vercel-remote-provider";
import { GcsRemoteDispatchJournal } from "../master-builder/remote-dispatch-journal";
import { HttpsModelLeaseIssuer } from "../master-builder/remote-model-credential";
import { RemoteEvidenceArchive } from "../master-builder/remote-evidence-archive";
import type { PlaybookRemoteTarget } from "../master-builder/playbook-remote-mission";

const REQUIRED = [
    "PBOS_DATABASE_URL", "PBOS_EXPECTED_NEON_HOST", "PBOS_EXPECTED_NEON_ROLE",
    "PBOS_DISPOSABLE_STATE_FILE", "PBOS_STATE_NAMESPACE", "PBOS_DISPOSABLE_AUTHORITY_ID",
    "PBOS_OBSERVATION_HOME", "PBOS_OBSERVATION_KEY_FILE", "PBOS_EXPECTED_STATE_SET_SHA256",
    "PBOS_PPS_DIRECTORY", "PBOS_PPS_MANIFEST_SHA256", "PBOS_MISSION_INPUT_FILE",
    "PBOS_APPROVAL_PUBLIC_KEY_FILE", "PBOS_APPROVAL_PUBLIC_KEY_SHA256",
    "PBOS_PROVIDER_SIGNING_KEY_FILE", "PBOS_PROVIDER_PUBLIC_KEY_FILE",
    "PBOS_PROVIDER_PUBLIC_KEY_SHA256", "PBOS_PROVIDER_AUTHORITY_ID", "PBOS_PROVIDER_ID",
    "PBOS_PLAYBOOK_SOURCE_SHA", "PBOS_PLAYBOOK_IMAGE", "PBOS_CODEX_BINARY_SHA256",
    "PBOS_WORKER_ID", "PBOS_WORKER_MODEL",
    "PBOS_VERCEL_SANDBOX_TOKEN", "PBOS_VERCEL_SANDBOX_TEAM_ID", "PBOS_VERCEL_SANDBOX_PROJECT_ID",
    "PBOS_MODEL_ORIGIN", "PBOS_MODEL_ADMIN_ORIGIN", "PBOS_MODEL_ADMIN_CREDENTIAL",
    "PBOS_DISPATCH_JOURNAL_BUCKET", "PBOS_EVIDENCE_DIRECTORY",
    "PBOS_CHECKPOINT_KEY_BASE64", "PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT"
] as const;
type Key = typeof REQUIRED[number];
export type ProtectedMb03Environment = Record<Key, string> & NodeJS.ProcessEnv;

// Readiness proves the immutable, read-only boundary only. Execution-only
// bindings (provider authority, journal, model lease and evidence sinks) are
// deliberately not required until a separately authorized mission run.
const READINESS_REQUIRED = REQUIRED.filter(name => ![
    "PBOS_MISSION_INPUT_FILE", "PBOS_PROVIDER_SIGNING_KEY_FILE",
    "PBOS_PROVIDER_AUTHORITY_ID", "PBOS_PROVIDER_ID", "PBOS_WORKER_ID",
    "PBOS_WORKER_MODEL", "PBOS_MODEL_ORIGIN", "PBOS_MODEL_ADMIN_ORIGIN",
    "PBOS_MODEL_ADMIN_CREDENTIAL", "PBOS_DISPATCH_JOURNAL_BUCKET",
    "PBOS_EVIDENCE_DIRECTORY", "PBOS_CHECKPOINT_KEY_BASE64"
].includes(name));

const SHA256 = /^[a-f0-9]{64}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const CANONICAL_WORKER_JOB = "pbos-mb03-playbook-codex";

export function requireProtectedMb03Environment(env: NodeJS.ProcessEnv, verifyOnly = false): ProtectedMb03Environment {
    const required = verifyOnly ? READINESS_REQUIRED : REQUIRED;
    const missing = required.filter(name => !env[name]?.trim());
    if (missing.length) throw new Error("MB-03 protected worker configuration missing: " + missing.join(", "));
    if (env.CLOUD_RUN_JOB !== CANONICAL_WORKER_JOB ||
        (verifyOnly ? env.PBOS_MISSION_EXECUTION_APPROVED !== "false" :
            env.PBOS_MISSION_EXECUTION_APPROVED !== "true")) {
        throw new Error("MB-03 requires its distinct, explicitly approved Cloud Run mission job.");
    }
    const config = Object.assign({}, env) as ProtectedMb03Environment;
    for (const name of required) config[name] = env[name]!.trim();
    for (const key of ["PBOS_EXPECTED_STATE_SET_SHA256", "PBOS_PPS_MANIFEST_SHA256",
        "PBOS_APPROVAL_PUBLIC_KEY_SHA256", "PBOS_PROVIDER_PUBLIC_KEY_SHA256",
        "PBOS_CODEX_BINARY_SHA256"] as const) {
        if (!SHA256.test(config[key])) throw new Error("Invalid reviewed digest: " + key);
    }
    if (!SHA40.test(config.PBOS_PLAYBOOK_SOURCE_SHA) ||
        !/^mb03-[A-Za-z0-9._-]+$/.test(config.PBOS_STATE_NAMESPACE) ||
        !/^[a-f0-9-]{36}$/.test(config.PBOS_DISPOSABLE_AUTHORITY_ID) ||
        !/^team_[A-Za-z0-9]+$/.test(config.PBOS_VERCEL_SANDBOX_TEAM_ID) ||
        !/^prj_[A-Za-z0-9]+$/.test(config.PBOS_VERCEL_SANDBOX_PROJECT_ID) ||
        !/^vcr\.vercel\.com\/pbos-genesis\/the-playbook\/pbos-mb03-playbook-worker@sha256:[a-f0-9]{64}$/.test(config.PBOS_PLAYBOOK_IMAGE)) {
        throw new Error("Unreviewed Playbook source, disposable state, or sandbox image identity.");
    }
    if ((!verifyOnly && (!/^[a-z0-9][a-z0-9-]{8,61}[a-z0-9]$/.test(config.PBOS_DISPATCH_JOURNAL_BUCKET) ||
        !/^[A-Za-z0-9._-]+$/.test(config.PBOS_WORKER_ID) ||
        !/^[A-Za-z0-9._-]+$/.test(config.PBOS_PROVIDER_AUTHORITY_ID) ||
        !/^[A-Za-z0-9._-]+$/.test(config.PBOS_PROVIDER_ID) ||
        !/^[a-zA-Z0-9][a-zA-Z0-9.-]+$/.test(config.PBOS_WORKER_MODEL))) ||
        !/^pbos-mb03-[a-z0-9-]+@pbos-genesis-staging\.iam\.gserviceaccount\.com$/.test(
            config.PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT)) {
        throw new Error("Unreviewed protected execution provider or cloud identity.");
    }
    const url = new URL(config.PBOS_DATABASE_URL);
    if (url.protocol !== "postgresql:" || url.hostname !== config.PBOS_EXPECTED_NEON_HOST ||
        !url.hostname.endsWith(".neon.tech") || url.pathname !== "/pbos_runner" ||
        decodeURIComponent(url.username) !== config.PBOS_EXPECTED_NEON_ROLE ||
        config.PBOS_EXPECTED_NEON_ROLE === "pbos_runner_owner") {
        throw new Error("MB-03 durable Neon connection does not match the reviewed worker role.");
    }
    const privateState = resolve(config.PBOS_DISPOSABLE_STATE_FILE);
    const canonical = resolve(config.PBOS_OBSERVATION_HOME);
    if (privateState === resolve(canonical, "genesis-state.json") ||
        privateState.startsWith(canonical + sep) || canonical.startsWith(dirname(privateState) + sep)) {
        throw new Error("MB-03 cannot use the canonical observation mount as writable execution state.");
    }
    return config;
}

/** Require immutable review inputs; no file creation, symlink or credential output. */
function readPrivateFile(path: string, maximum: number): Buffer {
    const full = resolve(path), parent = dirname(full);
    const meta = lstatSync(full);
    if (realpathSync(full) !== full || realpathSync(parent) !== parent ||
        !meta.isFile() || meta.isSymbolicLink() || meta.size < 1 ||
        meta.size > maximum || (meta.mode & 0o077) !== 0) {
        throw new Error("Protected MB-03 file is absent, redirected, exposed or unbounded.");
    }
    return readFileSync(full);
}

function publicFingerprint(pem: string): string {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Ed25519 public key is required.");
    return createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
}

function readPublicKeyForReadiness(path: string, envName: string, env: NodeJS.ProcessEnv, verifyOnly: boolean): string {
    const fromSecretEnv = verifyOnly ? env[envName]?.trim() : undefined;
    return fromSecretEnv || readPrivateFile(path, 16_384).toString("utf8");
}

async function googleRuntimeIdentity(expected: string, env: NodeJS.ProcessEnv): Promise<boolean> {
    if (env.CLOUD_RUN_JOB !== CANONICAL_WORKER_JOB) return false;
    try {
        const response = await fetch(
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
            { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(4000) }
        );
        return response.ok && response.headers.get("metadata-flavor") === "Google" &&
            (await response.text()).trim() === expected;
    } catch { return false; }
}

async function googleAccessToken(signal: AbortSignal): Promise<string> {
    const response = await fetch(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        { headers: { "Metadata-Flavor": "Google" }, signal, redirect: "error" }
    );
    if (!response.ok || response.headers.get("metadata-flavor") !== "Google") {
        throw new Error("Scoped GCP journal identity unavailable.");
    }
    const record = await response.json() as { access_token?: string; expires_in?: number };
    if (!record.access_token || !Number.isFinite(record.expires_in) || record.expires_in! < 60) {
        throw new Error("Scoped GCP journal token is not valid.");
    }
    return record.access_token;
}

interface PrivateMissionFile {
    readonly request: HostedPlaybookCodexComposition["input"]["request"];
    readonly approval: HostedPlaybookCodexComposition["input"]["approval"];
    readonly mission: HostedPlaybookCodexComposition["input"]["mission"];
    readonly scope: HostedPlaybookCodexComposition["input"]["scope"];
    readonly target: PlaybookRemoteTarget;
}

function sanitizedFailure(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw
        .replace(/postgres(?:ql)?:\/\/[^\s'\"]+/gi, "postgresql://[REDACTED]")
        .replace(/Bearer\s+[^\s'\"]+/gi, "Bearer [REDACTED]")
        .replace(/(password|token|secret|credential)(\s*[=:]\s*)[^\s'\"]+/gi, "$1$2[REDACTED]")
        .slice(0, 500);
}

export async function runProtectedMb03PlaybookCodex(
    env: NodeJS.ProcessEnv = process.env,
    verifyOnly = false
): Promise<Readonly<Record<string, unknown>>> {
    const config = requireProtectedMb03Environment(env, verifyOnly);
    const operatorPublicKey = readPublicKeyForReadiness(
        config.PBOS_APPROVAL_PUBLIC_KEY_FILE, "PBOS_APPROVAL_PUBLIC_KEY_PEM", env, verifyOnly);
    const providerPublicKey = readPublicKeyForReadiness(
        config.PBOS_PROVIDER_PUBLIC_KEY_FILE, "PBOS_PROVIDER_PUBLIC_KEY_PEM", env, verifyOnly);
    if (publicFingerprint(operatorPublicKey) !== config.PBOS_APPROVAL_PUBLIC_KEY_SHA256 ||
        publicFingerprint(providerPublicKey) !== config.PBOS_PROVIDER_PUBLIC_KEY_SHA256 ||
        config.PBOS_APPROVAL_PUBLIC_KEY_SHA256 === config.PBOS_PROVIDER_PUBLIC_KEY_SHA256) {
        throw new Error("Independently pinned operator and provider public keys are invalid or reused.");
    }
    let mission: PrivateMissionFile | undefined;
    if (!verifyOnly) {
        mission = JSON.parse(readPrivateFile(config.PBOS_MISSION_INPUT_FILE, 1024 * 1024).toString("utf8")) as PrivateMissionFile;
        if (!mission || typeof mission !== "object" || !mission.target ||
            mission.request?.commit !== config.PBOS_PLAYBOOK_SOURCE_SHA ||
            mission.approval?.payload?.commit !== config.PBOS_PLAYBOOK_SOURCE_SHA) {
            throw new Error("Protected mission envelope is missing or differs from the Playbook image source.");
        }
    }

    // The private writable state must exist. Neither the observer nor this
    // entrypoint is allowed to initialize or silently recover Genesis.
    readPrivateFile(config.PBOS_DISPOSABLE_STATE_FILE, 32 * 1024 * 1024);
    const state = new GenesisStateRepository(config.PBOS_DISPOSABLE_STATE_FILE, config.PBOS_STATE_NAMESPACE,
        { readOnlyRemote: verifyOnly });
    state.assertDisposableAuthority(config.PBOS_DISPOSABLE_AUTHORITY_ID);
    const runtime = new ProductionRuntimeService(state);
    if (!runtime.verifyIntegrity().valid) throw new Error("Disposable state integrity failed.");

    // Observe independently: the sealed canonical snapshot is NEVER the
    // mutation store. This proves read-only lineage, not runtime approval.
    const canonical = inspectSealedAdmissionSnapshot(
        config.PBOS_OBSERVATION_HOME, config.PBOS_OBSERVATION_KEY_FILE,
        config.PBOS_EXPECTED_STATE_SET_SHA256
    );
    if (canonical.status !== "INSPECTED" || !canonical.operatorAuthenticated ||
        canonical.integrityValid !== true || canonical.stateFilesUnchanged !== true ||
        canonical.activeRuns !== 0 || canonical.activeLeases !== 0) {
        throw new Error("Sealed canonical observation is not independently ready.");
    }
    const canon = await verifyPpsCanon(config.PBOS_PPS_DIRECTORY, config.PBOS_PPS_MANIFEST_SHA256);
    if (!canon.valid) throw new Error("The reviewed Playbook PPS Canon is invalid.");
    if (!(await googleRuntimeIdentity(config.PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT, env))) {
        throw new Error("Protected Cloud Run worker identity is not attested.");
    }

    // Read-only database readiness must succeed before the nonce or lease
    // can ever be written. No in-memory fallback is available.
    const sql = neon(config.PBOS_DATABASE_URL, { fullResults: true });
    const readOnlyDb: NeonLeaseSql = {
        async query<T extends Record<string, unknown>>(query: string, params: readonly unknown[]) {
            const [result] = await sql.transaction(tx => [tx.query(query, [...params])], { readOnly: true });
            return { rows: result.rows as T[] };
        }
    };
    if (!(await verifyHostedNeonReadiness(readOnlyDb, "pbos_runner", config.PBOS_EXPECTED_NEON_ROLE))) {
        throw new Error("Protected Neon worker catalog or role is unavailable.");
    }
    if (verifyOnly) {
        return {
            schema: "pbos.mb03.protected-bindings.v1",
            status: "READY_FOR_SEPARATE_SIGNED_APPROVAL",
            missionExecutionAuthorized: false,
            sourceSha: config.PBOS_PLAYBOOK_SOURCE_SHA,
            stateNamespace: config.PBOS_STATE_NAMESPACE,
            neonRole: config.PBOS_EXPECTED_NEON_ROLE,
            operatorPublicKeySha256: config.PBOS_APPROVAL_PUBLIC_KEY_SHA256,
            providerPublicKeySha256: config.PBOS_PROVIDER_PUBLIC_KEY_SHA256
        };
    }
    const providerSigningKey = createPrivateKey(
        readPrivateFile(config.PBOS_PROVIDER_SIGNING_KEY_FILE, 32_768).toString("utf8")
    );
    if (providerSigningKey.asymmetricKeyType !== "ed25519" ||
        publicFingerprint(createPublicKey(providerSigningKey).export({ type: "spki", format: "pem" }).toString()) !==
            config.PBOS_PROVIDER_PUBLIC_KEY_SHA256) {
        throw new Error("Provider signer and independently reviewed public key differ.");
    }
    const db: NeonLeaseSql = {
        async query<T extends Record<string, unknown>>(query: string, params: readonly unknown[]) {
            const result = await sql.query(query, [...params]);
            return { rows: result.rows as T[] };
        }
    };
    const composed = composeHostedNeonExecutor(db, {
        disposableNamespace: config.PBOS_STATE_NAMESPACE,
        trustedPublicKeyPem: operatorPublicKey,
        expectedStatePin: config.PBOS_EXPECTED_STATE_SET_SHA256,
        disposableAuthorityId: config.PBOS_DISPOSABLE_AUTHORITY_ID,
        verifyConstitution: async () => {
            state.assertDisposableAuthority(config.PBOS_DISPOSABLE_AUTHORITY_ID);
            return runtime.verifyIntegrity().valid &&
                (await verifyPpsCanon(config.PBOS_PPS_DIRECTORY, config.PBOS_PPS_MANIFEST_SHA256)).valid &&
                inspectSealedAdmissionSnapshot(config.PBOS_OBSERVATION_HOME,
                    config.PBOS_OBSERVATION_KEY_FILE, config.PBOS_EXPECTED_STATE_SET_SHA256).status === "INSPECTED";
        },
        verifyWorkloadIdentity: () =>
            googleRuntimeIdentity(config.PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT, env)
    });
    const policy = {
        authorityId: config.PBOS_PROVIDER_AUTHORITY_ID,
        providerId: config.PBOS_PROVIDER_ID,
        sourceSha: config.PBOS_PLAYBOOK_SOURCE_SHA,
        workerId: config.PBOS_WORKER_ID,
        image: config.PBOS_PLAYBOOK_IMAGE,
        codexBinaryDigest: config.PBOS_CODEX_BINARY_SHA256,
        model: config.PBOS_WORKER_MODEL,
        teamId: config.PBOS_VERCEL_SANDBOX_TEAM_ID,
        projectId: config.PBOS_VERCEL_SANDBOX_PROJECT_ID,
        credentials: async () => ({
            token: config.PBOS_VERCEL_SANDBOX_TOKEN,
            teamId: config.PBOS_VERCEL_SANDBOX_TEAM_ID,
            projectId: config.PBOS_VERCEL_SANDBOX_PROJECT_ID
        }),
        signer: providerSigningKey,
        playbook: mission!.target,
        dispatch: new GcsRemoteDispatchJournal(config.PBOS_DISPATCH_JOURNAL_BUCKET, googleAccessToken),
        modelLeases: new HttpsModelLeaseIssuer(config.PBOS_MODEL_ADMIN_ORIGIN, config.PBOS_MODEL_ORIGIN,
            async () => config.PBOS_MODEL_ADMIN_CREDENTIAL)
    };
    const trust = {
        authorityId: policy.authorityId,
        providerId: policy.providerId,
        publicKey: createPublicKey(providerPublicKey),
        isolationProfile: new VercelPlaybookProvider(policy).isolationProfile,
        archive: new RemoteEvidenceArchive(resolve(config.PBOS_EVIDENCE_DIRECTORY), 90),
        timeoutMs: 60_000
    };
    const result = await executeHostedPlaybookCodexMission({
        input: { request: mission!.request, approval: mission!.approval,
            mission: mission!.mission, scope: mission!.scope },
        policy,
        adapters: {
            runner: new ProductionMissionRunner(state, runtime),
            admission: composed.dependencies,
            trust,
            checkpoints: composed.checkpoints,
            sealCheckpoint: checkpointSealer(config.PBOS_CHECKPOINT_KEY_BASE64)
        }
    });
    return {
        schema: "pbos.mb03.hosted-playbook-codex-result.v1",
        executionKind: "REMOTE_CODEX_INDEPENDENT_REVIEW_REQUIRED",
        stopReason: result.stopReason,
        missionId: mission!.mission.missionId,
        runs: result.runs.map(run => ({
            runId: run.runId, status: run.status, evidenceIds: run.evidenceIds
        })),
        certificationGranted: false
    };
}

// Explicit executable only. No automatic dispatch during CI or import.
if (require.main === module) {
    const verifyOnly = process.argv[2] === "--verify-bindings" && process.argv.length === 3;
    if (process.argv.length > 2 && !verifyOnly) throw new Error("Unsupported protected controller argument.");
    runProtectedMb03PlaybookCodex(process.env, verifyOnly).then(result => {
        process.stdout.write(JSON.stringify(result) + "\n");
    }).catch(error => {
        process.stderr.write(JSON.stringify({
            gate: "MB03_PROTECTED_PLAYBOOK_CODEX_EXECUTION",
            status: "BLOCKED",
            note: "Protected execution rejected; inspect private evidence through the approved operator channel.",
            reason: sanitizedFailure(error)
        }) + "\n");
        process.exitCode = 2;
    });
}
