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
import { disposableStateObject, probeDisposableWriter } from "../genesis-state/gcs-disposable-state";
import { GenesisStateRepository } from "../genesis-state";
import { ProductionRuntimeService } from "../production-runtime/production-runtime-service";
import { ProductionMissionRunner } from "../production-runtime/production-mission-runner";
import { inspectSealedAdmissionSnapshot } from "../production-runtime/sealed-admission-snapshot";
import { verifyPpsCanon } from "../boot/pps-canon-snapshot-verifier";
import { verifyHostedNeonReadiness } from "../production-runtime/hosted-neon-readiness";
import { composeHostedNeonExecutor } from "../production-runtime/hosted-neon-executor-composition";
import type { NeonLeaseSql } from "../production-runtime/neon-fenced-lease-provider";
import {
    executeHostedPlaybookCodexMission
} from "../production-runtime/hosted-playbook-codex-composition";
import { inspectHostedPlanReady, interruptedPlan } from "../production-runtime/hosted-plan-ready-inspection";
import { checkpointSealer } from "./mb03-hosted-executor";
import { VercelPlaybookProvider } from "../master-builder/vercel-remote-provider";
import { GcsRemoteDispatchJournal } from "../master-builder/remote-dispatch-journal";
import { HttpsModelLeaseIssuer } from "../master-builder/remote-model-credential";
import { GcsHostedEvidence } from "../master-builder/gcs-hosted-evidence";
import { GitHubAppPlaybookPrApi } from "../production-runtime/github-app-playbook-pr-api";
import { recoveryPreview } from "./mb03-sign-mission";
import { inspectOriginalRecoveryPackage, type ProtectedPlaybookMissionFile } from "./mb03-mission-package";

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
// bindings (provider authority, model lease and evidence sinks) are
// deliberately not required until a separately authorized mission run.
const READINESS_REQUIRED = REQUIRED.filter(name => ![
    "PBOS_MISSION_INPUT_FILE", "PBOS_PROVIDER_SIGNING_KEY_FILE", "PBOS_PROVIDER_SIGNING_KEY_PEM",
    "PBOS_PROVIDER_AUTHORITY_ID", "PBOS_PROVIDER_ID", "PBOS_WORKER_ID",
    "PBOS_WORKER_MODEL", "PBOS_MODEL_ORIGIN", "PBOS_MODEL_ADMIN_ORIGIN",
    "PBOS_MODEL_ADMIN_CREDENTIAL",
    "PBOS_EVIDENCE_DIRECTORY", "PBOS_CHECKPOINT_KEY_BASE64",
    "PBOS_VERCEL_SANDBOX_TOKEN"
].includes(name));

const SHA256 = /^[a-f0-9]{64}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const CANONICAL_WORKER_JOB = "pbos-mb03-playbook-codex";
const CANONICAL_READINESS_JOB = "pbos-mb03-playbook-readiness";
const JOURNAL_BUCKET = "pbos-genesis-staging-mb03-dispatch-journal";

export function requireProtectedMb03Environment(env: NodeJS.ProcessEnv, verifyOnly = false): ProtectedMb03Environment {
    const required = verifyOnly ? READINESS_REQUIRED : REQUIRED;
    const missing = required.filter(name => !env[name]?.trim());
    if (missing.length) throw new Error("MB-03 protected worker configuration missing: " + missing.join(", "));
    if ((verifyOnly
        ? (env.CLOUD_RUN_JOB !== CANONICAL_READINESS_JOB ||
            env.PBOS_MISSION_EXECUTION_APPROVED !== "false")
        : (env.CLOUD_RUN_JOB !== CANONICAL_WORKER_JOB ||
            env.PBOS_MISSION_EXECUTION_APPROVED !== "true"))) {
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
    if (config.PBOS_DISPATCH_JOURNAL_BUCKET !== JOURNAL_BUCKET) {
        throw new Error("Unreviewed staging dispatch journal.");
    }
    if ((!verifyOnly && (!/^[A-Za-z0-9._-]+$/.test(config.PBOS_WORKER_ID) ||
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

export type ProtectedMb03FileCategory =
    | "operator-public-key" | "provider-public-key" | "provider-signing-key"
    | "mission-input" | "disposable-state";

export function protectedMb03FileBoundaryCode(
    category: ProtectedMb03FileCategory, condition: string
): string {
    return `MB03_FILE_BOUNDARY:${category}:${condition}`;
}

export function allowsManagedSecretAlias(path: string, canonicalParent: string): boolean {
    // Only the exact platform /var/run -> /run spelling is trusted.
    // Prefix-only checks could accidentally permit other nested redirects.
    return path.startsWith("/var/run/secrets/mb03/") &&
        canonicalParent === dirname(path).replace(/^\/var\/run\//, "/run/");
}

/** Require immutable review inputs; no file creation, symlink or credential output. */
export function readProtectedMb03File(
    path: string, maximum: number, category: ProtectedMb03FileCategory
): Buffer {
    const full = resolve(path), parent = dirname(full);
    let meta;
    try {
        meta = lstatSync(full);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            throw new Error(protectedMb03FileBoundaryCode(category, "missing"));
        }
        throw new Error(protectedMb03FileBoundaryCode(category, "stat-failed"));
    }
    try {
        const canonicalParent = realpathSync(parent);
        const managedSecretAlias = allowsManagedSecretAlias(full, canonicalParent);
        if (canonicalParent !== parent && !managedSecretAlias) {
            throw new Error(protectedMb03FileBoundaryCode(category, "parent-redirected"));
        }
        const canonicalFull = realpathSync(full);
        if (canonicalFull !== full &&
            !(managedSecretAlias && canonicalFull === full.replace(/^\/var\/run\//, "/run/"))) {
            throw new Error(protectedMb03FileBoundaryCode(category, "redirected"));
        }
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("MB03_FILE_BOUNDARY:")) throw error;
        throw new Error(protectedMb03FileBoundaryCode(category, "realpath-failed"));
    }
    if (meta.isSymbolicLink()) throw new Error(protectedMb03FileBoundaryCode(category, "symlink"));
    if (!meta.isFile()) throw new Error(protectedMb03FileBoundaryCode(category, "not-regular"));
    if (meta.size < 1) throw new Error(protectedMb03FileBoundaryCode(category, "empty"));
    if (meta.size > maximum) throw new Error(protectedMb03FileBoundaryCode(category, "oversized"));
    if ((meta.mode & 0o077) !== 0) throw new Error(protectedMb03FileBoundaryCode(category, "exposed-permissions"));
    return readFileSync(full);
}

function publicFingerprint(pem: string): string {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Ed25519 public key is required.");
    return createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
}

function readPublicKeyForReadiness(path: string, envName: string, env: NodeJS.ProcessEnv, verifyOnly: boolean): string {
    const fromSecretEnv = verifyOnly ? env[envName]?.trim() : undefined;
    return fromSecretEnv || readProtectedMb03File(path, 16_384,
        envName === "PBOS_APPROVAL_PUBLIC_KEY_PEM" ? "operator-public-key" : "provider-public-key").toString("utf8");
}

export async function googleRuntimeIdentity(expected: string, env: NodeJS.ProcessEnv,
    verifyOnly = false): Promise<boolean> {
    const expectedJob = verifyOnly ? CANONICAL_READINESS_JOB : CANONICAL_WORKER_JOB;
    if (env.CLOUD_RUN_JOB !== expectedJob) return false;
    try {
        const response = await fetch(
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
            { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(4000), redirect: "error" }
        );
        return response.ok && response.headers.get("metadata-flavor") === "Google" &&
            (await response.text()).trim() === expected;
    } catch { return false; }
}

const { googleAccessToken }: { googleAccessToken: (signal: AbortSignal) => Promise<string> } =
    require("../genesis-state/gcs-state-request.cjs");

function sanitizedFailure(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw
        .replace(/postgres(?:ql)?:\/\/[^\s'\"]+/gi, "postgresql://[REDACTED]")
        .replace(/Bearer\s+[^\s'\"]+/gi, "Bearer [REDACTED]")
        .replace(/(password|token|secret|credential)(\s*[=:]\s*)[^\s'\"]+/gi, "$1$2[REDACTED]")
        .slice(0, 500);
}

function hostedEvidence(directory: string | undefined) {
    if (directory !== "/var/lib/pbos-evidence") throw new Error("Unexpected evidence mount.");
    return new GcsHostedEvidence(directory, googleAccessToken);
}

async function verifyProbeIdentity(env: NodeJS.ProcessEnv, readinessJob = false) {
    const identity = "pbos-mb03-playbook-codex@pbos-genesis-staging.iam.gserviceaccount.com";
    if (env.PBOS_MISSION_EXECUTION_APPROVED !== "false" ||
        env.PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT !== identity || !await googleRuntimeIdentity(identity, env, readinessJob)) {
        throw new Error("Storage probe requires the staging controller with mission execution disabled.");
    }
}

export async function verifyMission001JournalRead(env: NodeJS.ProcessEnv) {
    if (env.PBOS_DISPATCH_JOURNAL_BUCKET !== JOURNAL_BUCKET ||
        env.PBOS_PLAYBOOK_SOURCE_SHA !== interruptedPlan.commit) throw Error("RECOVERY_JOURNAL_BINDING");
    await verifyProbeIdentity(env, true);
    await new GcsRemoteDispatchJournal(JOURNAL_BUCKET, googleAccessToken).verifyReservationReadBoundary(
        interruptedPlan.repository, interruptedPlan.missionId, AbortSignal.timeout(10_000));
    return { status: "MISSION_001_JOURNAL_READ_VERIFIED", missionId: interruptedPlan.missionId,
        reservationHttp: 404, siblingHttp: 403, missionExecutionAuthorized: false };
}

export async function verifyStateWriter(env: NodeJS.ProcessEnv) {
    await verifyProbeIdentity(env);
    return probeDisposableWriter(await googleAccessToken(AbortSignal.timeout(4000)));
}

export async function verifyEvidenceMount(env: NodeJS.ProcessEnv) {
    await verifyProbeIdentity(env);
    const evidenceDigest = await hostedEvidence(env.PBOS_EVIDENCE_DIRECTORY).preserve({
        schema: "pbos.mb03.synthetic-evidence-probe.v1", execution: env.CLOUD_RUN_EXECUTION
    });
    return { status: "EVIDENCE_MOUNT_VERIFIED", evidenceDigest, missionExecutionAuthorized: false };
}

export async function runProtectedMb03PlaybookCodex(
    env: NodeJS.ProcessEnv = process.env,
    mode: boolean | "inspect-plan-ready" | "verify-recovery-package" = false
): Promise<Readonly<Record<string, unknown>>> {
    const verifyOnly = mode !== false;
    const config = requireProtectedMb03Environment(env, verifyOnly);
    if (!await googleRuntimeIdentity(config.PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT, env, verifyOnly)) {
        throw new Error("Protected Cloud Run worker identity is not attested.");
    }
    const dispatchJournal = new GcsRemoteDispatchJournal(config.PBOS_DISPATCH_JOURNAL_BUCKET, googleAccessToken);
    await dispatchJournal.verifyProtection(AbortSignal.timeout(5000));
    const operatorPublicKey = readPublicKeyForReadiness(
        config.PBOS_APPROVAL_PUBLIC_KEY_FILE, "PBOS_APPROVAL_PUBLIC_KEY_PEM", env, verifyOnly);
    const providerPublicKey = readPublicKeyForReadiness(
        config.PBOS_PROVIDER_PUBLIC_KEY_FILE, "PBOS_PROVIDER_PUBLIC_KEY_PEM", env, verifyOnly);
    if (publicFingerprint(operatorPublicKey) !== config.PBOS_APPROVAL_PUBLIC_KEY_SHA256 ||
        publicFingerprint(providerPublicKey) !== config.PBOS_PROVIDER_PUBLIC_KEY_SHA256 ||
        config.PBOS_APPROVAL_PUBLIC_KEY_SHA256 === config.PBOS_PROVIDER_PUBLIC_KEY_SHA256) {
        throw new Error("Independently pinned operator and provider public keys are invalid or reused.");
    }
    let mission: ProtectedPlaybookMissionFile | undefined;
    if (!verifyOnly) {
        mission = JSON.parse(readProtectedMb03File(config.PBOS_MISSION_INPUT_FILE, 1024 * 1024, "mission-input").toString("utf8")) as ProtectedPlaybookMissionFile;
        if (!mission || typeof mission !== "object" || !mission.target ||
            mission.request?.commit !== config.PBOS_PLAYBOOK_SOURCE_SHA ||
            mission.approval?.payload?.commit !== config.PBOS_PLAYBOOK_SOURCE_SHA) {
            throw new Error("Protected mission envelope is missing or differs from the Playbook image source.");
        }
    }

    // The private writable state must exist. Neither the observer nor this
    // entrypoint is allowed to initialize or silently recover Genesis.
    readProtectedMb03File(config.PBOS_DISPOSABLE_STATE_FILE, 32 * 1024 * 1024, "disposable-state");
    const versionedObject = verifyOnly ? undefined : disposableStateObject(config.PBOS_DISPOSABLE_STATE_FILE);
    const state = new GenesisStateRepository(config.PBOS_DISPOSABLE_STATE_FILE, config.PBOS_STATE_NAMESPACE,
        // Readiness inspects the mount. The mission writer fences the same staging
        // object directly; GCSFuse cannot supply the POSIX lock/rename contract.
        { readOnlyRemote: verifyOnly, managedRemote: !verifyOnly, versionedObject });
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
    if (mode === "inspect-plan-ready" || mode === "verify-recovery-package") {
        if (config.PBOS_PLAYBOOK_SOURCE_SHA !== interruptedPlan.commit ||
            config.PBOS_MISSION_EXECUTION_APPROVED !== "false") throw Error("RECOVERY_INSPECTION_BINDING");
        const { stateRequest } = require("../genesis-state/gcs-state-request.cjs");
        const observed = await inspectHostedPlanReady({ accessToken: googleAccessToken, db: readOnlyDb, journal: dispatchJournal,
            readPinnedPair: async pin => stateRequest({ object: "synthetic/genesis-state.json", op: "inspect-recovery",
                generation: pin.stateGeneration, recovery: pin, token: await googleAccessToken(AbortSignal.timeout(4000)) }) },
            undefined, mode === "verify-recovery-package" ? async run => {
                if (config.PBOS_APPROVAL_PUBLIC_KEY_SHA256 !== recoveryPreview().operatorPublicKeySha256)
                    throw Error("RECOVERY_OPERATOR_KEY_PIN");
                if (env.PBOS_MISSION_INPUT_FILE !== "/var/lib/pbos-missions/mission.json")
                    throw Error("RECOVERY_ORIGINAL_PACKAGE_BINDING");
                if (!env.PBOS_GITHUB_APP_INSTALLATION_TOKEN?.trim()) throw Error("RECOVERY_GITHUB_INSTALLATION_BINDING");
                const raw = readProtectedMb03File(env.PBOS_MISSION_INPUT_FILE, 1024 * 1024, "mission-input");
                let original: ProtectedPlaybookMissionFile;
                try { original = JSON.parse(raw.toString("utf8")); }
                catch { throw Error("RECOVERY_ORIGINAL_PACKAGE_JSON"); }
                await inspectOriginalRecoveryPackage(original, run, operatorPublicKey,
                    new GitHubAppPlaybookPrApi(env.PBOS_GITHUB_APP_INSTALLATION_TOKEN));
            } : undefined);
        if (mode === "inspect-plan-ready") return observed;
        return { ...observed, status: "RECOVERY_PACKAGE_OBSERVED", publicationBase: recoveryPreview().publicationBase,
            scopeDigest: recoveryPreview().scopeDigest, currentApprovalVerified: false };
    }
    if (verifyOnly) {
        return {
            schema: "pbos.mb03.protected-bindings.v1",
            status: "READY_FOR_SEPARATE_SIGNED_APPROVAL",
            missionExecutionAuthorized: false,
            sourceSha: config.PBOS_PLAYBOOK_SOURCE_SHA,
            stateNamespace: config.PBOS_STATE_NAMESPACE,
            neonRole: config.PBOS_EXPECTED_NEON_ROLE,
            journalProtectionVerified: true,
            operatorPublicKeySha256: config.PBOS_APPROVAL_PUBLIC_KEY_SHA256,
            providerPublicKeySha256: config.PBOS_PROVIDER_PUBLIC_KEY_SHA256
        };
    }
    const providerSigningPem = env.PBOS_PROVIDER_SIGNING_KEY_PEM?.trim() ||
        readProtectedMb03File(config.PBOS_PROVIDER_SIGNING_KEY_FILE, 32_768, "provider-signing-key").toString("utf8");
    const providerSigningKey = createPrivateKey(providerSigningPem);
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
        dispatch: dispatchJournal,
        modelLeases: new HttpsModelLeaseIssuer(config.PBOS_MODEL_ADMIN_ORIGIN, config.PBOS_MODEL_ORIGIN,
            async () => config.PBOS_MODEL_ADMIN_CREDENTIAL)
    };
    const trust = {
        authorityId: policy.authorityId,
        providerId: policy.providerId,
        publicKey: createPublicKey(providerPublicKey),
        isolationProfile: new VercelPlaybookProvider(policy).isolationProfile,
        archive: hostedEvidence(config.PBOS_EVIDENCE_DIRECTORY),
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
    const inspect = process.argv[2] === "--inspect-plan-ready" && process.argv.length === 3;
    const recoveryPackage = process.argv[2] === "--verify-recovery-package" && process.argv.length === 3;
    const probe = process.argv[2] === "--verify-evidence-mount" && process.argv.length === 3;
    const stateProbe = process.argv[2] === "--verify-state-writer" && process.argv.length === 3;
    const journalProbe = process.argv[2] === "--verify-mission-001-journal-read" && process.argv.length === 3;
    if (process.argv.length > 2 && !verifyOnly && !inspect && !recoveryPackage && !probe && !stateProbe && !journalProbe) throw new Error("Unsupported protected controller argument.");
    const checkStorage = journalProbe ? verifyMission001JournalRead : stateProbe ? verifyStateWriter : probe ? verifyEvidenceMount : undefined;
    (checkStorage ? checkStorage(process.env) : runProtectedMb03PlaybookCodex(process.env, recoveryPackage ? "verify-recovery-package" : inspect ? "inspect-plan-ready" : verifyOnly)).then(result => {
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
