import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";
import { GenesisStateRepository, OperatorIdentityService } from "../genesis-state";
import type { VerifiableApproval } from "../genesis-state/operator-identity";
import type { ProductionMissionRequest } from "../production-runtime/production-mission-runner";
import { attestExactDisposableFiles } from "./disposable-change-boundary";
import { mb03ApprovalScope, runMb03DisposableMission } from "./mb03-disposable-mission";
import type { DisposableCodexContext, Mb03Mission } from "./mb03-disposable-mission";
import { evidenceDigest, evidenceJson, evidenceSha256, requireRemoteSignature } from "./remote-attestation";
import type { SignedRemoteEvidence } from "./remote-attestation";
import type { RemoteEvidenceArchive } from "./remote-evidence-archive";

export const REMOTE_PROVISION_DOMAIN = "pbos.mb031.provision.v1";
export const REMOTE_RETURN_DOMAIN = "pbos.mb031.return.v1";
export const MAX_REMOTE_TTL_MS = 15 * 60_000;
export const MAX_REMOTE_FILE_BYTES = 1024 * 1024;

export interface RemoteWorkerBinding {
    readonly authorityId: string;
    readonly fence: string;
    readonly approvalDigest: string;
    readonly mission: Mb03Mission;
    readonly deadline: string;
}

export interface RemoteProvision {
    readonly providerId: string;
    readonly bindingDigest: string;
    readonly sandboxId: string;
    readonly isolationProfile: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
    readonly credentialExpiresAt: string;
}

export interface RemoteReturn {
    readonly providerId: string;
    readonly bindingDigest: string;
    readonly sandboxId: string;
    readonly completedAt: string;
    readonly outputsDigest: string;
    readonly status: "SUCCEEDED";
}

export interface RemoteFileOutput {
    readonly path: string;
    readonly contentBase64: string;
}

/** Implement at the trusted provider control plane. Never pass controller paths or operator credentials to this interface. */
export interface TrustedRemoteWorkerProvider {
    readonly mode: "isolated-remote" | "fixture";
    provision(binding: RemoteWorkerBinding, signal: AbortSignal): Promise<SignedRemoteEvidence<RemoteProvision>>;
    execute(binding: RemoteWorkerBinding, request: Readonly<{ title: string; rationale: string }>, signal: AbortSignal):
        Promise<{ receipt: SignedRemoteEvidence<RemoteReturn>; files: readonly RemoteFileOutput[] }>;
    /** Must be idempotent and revoke credentials, terminate the VM/job, and discard scratch, including on controller loss. */
    dispose(binding: RemoteWorkerBinding): Promise<void>;
}

export interface RemoteWorkerTrust {
    readonly authorityId: string;
    readonly providerId: string;
    readonly publicKey: KeyObject;
    readonly isolationProfile: string;
    readonly archive: RemoteEvidenceArchive;
    readonly timeoutMs: number;
    readonly pollMs?: number;
    readonly allowFixture?: boolean;
}

export function verifyProvision(binding: RemoteWorkerBinding, receipt: SignedRemoteEvidence<RemoteProvision>,
    trust: Pick<RemoteWorkerTrust, "providerId" | "publicKey" | "isolationProfile">, at: number) {
    const expected = evidenceDigest(evidenceJson(binding));
    const provision = requireRemoteSignature(REMOTE_PROVISION_DOMAIN, receipt, trust.publicKey);
    const expiresAt = Date.parse(provision.expiresAt);
    const issuedAt = Date.parse(provision.issuedAt);
    const credentialExpiresAt = Date.parse(provision.credentialExpiresAt);
    if (Object.keys(provision).sort().join(",") !== "bindingDigest,credentialExpiresAt,expiresAt,isolationProfile,issuedAt,providerId,sandboxId") {
        throw new Error("Unexpected remote provision fields.");
    }
    if (provision.providerId !== trust.providerId || provision.bindingDigest !== expected ||
        provision.isolationProfile !== trust.isolationProfile || !/^[A-Za-z0-9._-]+$/.test(provision.sandboxId) ||
        !(issuedAt <= at && expiresAt > at && expiresAt <= Date.parse(binding.deadline) &&
            credentialExpiresAt > at && credentialExpiresAt <= expiresAt)) throw new Error("Remote provision binding or lifetime rejected.");
    return provision;
}

export function verifyRemoteReturn(binding: RemoteWorkerBinding, provision: RemoteProvision, signed: SignedRemoteEvidence<RemoteReturn>,
    publicKey: KeyObject, at: number) {
    const receipt = requireRemoteSignature(REMOTE_RETURN_DOMAIN, signed, publicKey);
    const completed = Date.parse(receipt.completedAt);
    if (Object.keys(receipt).sort().join(",") !== "bindingDigest,completedAt,outputsDigest,providerId,sandboxId,status") {
        throw new Error("Unexpected remote execution receipt fields.");
    }
    if (receipt.bindingDigest !== evidenceDigest(evidenceJson(binding)) || receipt.providerId !== provision.providerId ||
        receipt.sandboxId !== provision.sandboxId || receipt.status !== "SUCCEEDED" ||
        !evidenceSha256(receipt.outputsDigest) || !(completed >= Date.parse(provision.issuedAt) && completed <= at &&
            at < Date.parse(provision.expiresAt) && completed < Date.parse(provision.credentialExpiresAt))) {
        throw new Error("Remote execution receipt rejected.");
    }
    return receipt;
}

export async function runTrustedRemoteMission(state: GenesisStateRepository, identities: OperatorIdentityService,
    input: Mb03Mission, approval: VerifiableApproval, request: ProductionMissionRequest, context: DisposableCodexContext,
    provider: TrustedRemoteWorkerProvider, trust: RemoteWorkerTrust) {
    state.assertDisposableAuthority(trust.authorityId);
    if ((provider.mode !== "isolated-remote" && !(provider.mode === "fixture" && trust.allowFixture === true)) ||
        !trust.providerId || !evidenceSha256(trust.isolationProfile) || !Number.isInteger(trust.timeoutMs) ||
        trust.timeoutMs <= 0 || trust.timeoutMs > MAX_REMOTE_TTL_MS ||
        (trust.pollMs !== undefined && (!Number.isInteger(trust.pollMs) || trust.pollMs < 10 || trust.pollMs > 5000))) {
        throw new Error("Trusted remote provider deployment is not configured.");
    }
    const mission: Mb03Mission = Object.freeze({
        missionId: input.missionId, repository: input.repository, sourceSha: input.sourceSha,
        environment: input.environment, stateNamespace: input.stateNamespace, attemptId: input.attemptId,
        workerId: input.workerId, allowedPaths: Object.freeze([...input.allowedPaths].sort()),
    });
    mb03ApprovalScope(mission);
    const approvalDigest = evidenceDigest(approval.signature);
    const approvalExpiresAt = Date.parse(approval.expiresAt);
    return runMb03DisposableMission(state, identities, mission, approval, request, context, undefined, {
        pollMs: trust.pollMs,
        timeoutMs: trust.timeoutMs,
        async execute(work, fence, signal, assertLive) {
            const binding: RemoteWorkerBinding = Object.freeze({ authorityId: trust.authorityId, fence, approvalDigest, mission,
                deadline: new Date(Math.min(Date.now() + trust.timeoutMs, approvalExpiresAt)).toISOString() });
            let disposal: Promise<void> | undefined;
            const terminate = () => disposal ??= Promise.resolve().then(() => provider.dispose(binding));
            const onAbort = () => { void terminate().catch(() => undefined); };
            signal.addEventListener("abort", onAbort, { once: true });
            try {
                signal.throwIfAborted();
                const { payload, signature } = structuredClone(await provider.provision(binding, signal));
                const provisionEnvelope = { payload, signature };
                const provision = verifyProvision(binding, provisionEnvelope, trust, Date.now());
                signal.throwIfAborted();
                assertLive();
                const result = structuredClone(await provider.execute(binding, { title: work.title, rationale: work.rationale }, signal));
                signal.throwIfAborted();
                const returnEnvelope = { payload: result.receipt.payload, signature: result.receipt.signature };
                const signed = verifyRemoteReturn(binding, provision, returnEnvelope, trust.publicKey, Date.now());
                if (!Array.isArray(result.files) || !result.files.length || result.files.length > mission.allowedPaths.length ||
                    new Set(result.files.map(file => file.path)).size !== result.files.length) throw new Error("Invalid remote file manifest.");
                const files = result.files.map(file => {
                    if (!mission.allowedPaths.includes(file.path) || typeof file.contentBase64 !== "string" ||
                        file.contentBase64.length > 4 * Math.ceil(MAX_REMOTE_FILE_BYTES / 3)) throw new Error("Remote output exceeds approved scope.");
                    const bytes = Buffer.from(file.contentBase64, "base64");
                    if (bytes.length > MAX_REMOTE_FILE_BYTES || bytes.toString("base64") !== file.contentBase64) {
                        throw new Error("Invalid remote output encoding.");
                    }
                    return { path: file.path, bytes };
                });
                const manifest = files.map(file => ({ path: file.path, digest: evidenceDigest(file.bytes) }));
                if (signed.outputsDigest !== evidenceDigest(evidenceJson(manifest))) throw new Error("Signed output manifest mismatch.");
                await terminate();
                signal.throwIfAborted();
                await attestExactDisposableFiles(work.workingDirectory, mission.allowedPaths);
                assertLive();
                const receiptDigest = trust.archive.preserve({
                    mode: provider.mode, binding, provision: provisionEnvelope, receipt: returnEnvelope, manifest,
                });
                for (const file of files) {
                    signal.throwIfAborted();
                    const output = await open(join(work.workingDirectory, file.path), constants.O_WRONLY | constants.O_NOFOLLOW);
                    try {
                        const metadata = await output.stat();
                        if (!metadata.isFile() || metadata.nlink !== 1) throw new Error("Remote output target is not a private regular file.");
                        signal.throwIfAborted();
                        await output.truncate(0);
                        await output.writeFile(file.bytes);
                    } finally { await output.close(); }
                }
                return { summary: signed.outputsDigest, receiptDigest };
            } finally {
                signal.removeEventListener("abort", onAbort);
                await terminate();
            }
        },
    });
}
