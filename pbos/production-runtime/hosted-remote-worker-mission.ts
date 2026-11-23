/**
 * Governed MB-03 hosted REMOTE-WORKER boundary (not the documentation compiler).
 *
 * Uses the existing signed hosted admission, durable Neon lease/nonce,
 * ProductionMissionRunner, and independently signed remote provider receipts.
 * Never publishes a PR, promotes a snapshot, certifies or deploys anything.
 * Exact output is encrypted into a fenced checkpoint for independent review.
 */
import { createHash } from "node:crypto";
import type { ProductionMissionRunner, ProductionMissionRequest } from "./production-mission-runner";
import { runHostedApprovedMission, type HostedExecutionDependencies } from "./hosted-approved-mission";
import type { SignedHostedMissionApproval, HostedMissionScope } from "./hosted-signed-mission-approval";
import type { NeonFencedMissionCheckpoint } from "./neon-fenced-mission-checkpoint";
import { evidenceDigest, evidenceJson, evidenceSha256 } from "../master-builder/remote-attestation";
import type { Mb03Mission } from "../master-builder/mb03-disposable-mission";
import { isExactDisposableFile } from "../master-builder/disposable-change-boundary";
import {
    MAX_REMOTE_FILE_BYTES, MAX_REMOTE_TTL_MS, verifyProvision, verifyRemoteReturn, verifyRemoteDisposal
} from "../master-builder/trusted-remote-worker";
import type {
    RemoteWorkerBinding, TrustedRemoteWorkerProvider, RemoteWorkerTrust
} from "../master-builder/trusted-remote-worker";

export interface HostedRemoteWorkerInput {
    readonly request: ProductionMissionRequest;
    readonly approval: SignedHostedMissionApproval;
    readonly mission: Mb03Mission;
    readonly scope: HostedMissionScope;
}

export interface HostedRemoteWorkerAdapters {
    readonly runner: ProductionMissionRunner;
    readonly admission: HostedExecutionDependencies;
    readonly provider: TrustedRemoteWorkerProvider;
    readonly trust: RemoteWorkerTrust;
    readonly trustedWorkerId: string;
    readonly checkpoints: Pick<NeonFencedMissionCheckpoint, "commit">;
    readonly sealCheckpoint: (plaintext: Uint8Array) => Promise<Uint8Array>;
}

function assertBoundedInput(input: HostedRemoteWorkerInput, adapters: HostedRemoteWorkerAdapters): void {
    const { request, approval, mission, scope } = input;
    const { provider, trust, admission, trustedWorkerId } = adapters;
    if (provider.mode !== "isolated-remote" || trust.allowFixture ||
        !trust.authorityId || !trust.providerId || !trustedWorkerId ||
        !evidenceSha256(trust.isolationProfile) ||
        !Number.isSafeInteger(trust.timeoutMs) || trust.timeoutMs < 1000 ||
        trust.timeoutMs > MAX_REMOTE_TTL_MS ||
        trust.publicKey.type !== "public" || trust.publicKey.asymmetricKeyType !== "ed25519") {
        throw new Error("A separately attested, non-fixture remote provider is required.");
    }
    if (mission.environment !== "DISPOSABLE" || !mission.missionId ||
        mission.missionId !== approval.payload.missionId ||
        mission.repository !== request.repository || mission.repository !== approval.payload.repository ||
        mission.sourceSha !== request.commit || mission.sourceSha !== approval.payload.commit ||
        !/^[a-f0-9]{40}$/.test(mission.sourceSha) ||
        mission.workerId !== trustedWorkerId ||
        mission.stateNamespace !== admission.disposableNamespace ||
        mission.attemptId !== approval.payload.nonce ||
        request.actorId !== approval.payload.operatorId ||
        request.authorizationArtifactId !== "hosted-approval:" + approval.payload.nonce ||
        request.approvedMissionIds?.length !== 1 ||
        request.approvedMissionIds[0] !== mission.missionId ||
        request.autonomousContinuation !== false || request.maximumMissions !== 1 ||
        request.triggerSource === "CONTINUATION" ||
        !/^disposable\/[A-Za-z0-9._/-]+$/.test(request.branch) ||
        scope.branch !== request.branch || !scope.path || !evidenceSha256(scope.contentSha256) ||
        mission.allowedPaths.length !== 1 || mission.allowedPaths[0] !== scope.path ||
        !isExactDisposableFile(scope.path)) {
        throw new Error("Hosted remote mission and signed exact-file scope differ.");
    }
}

/** A verified provider return is only BUILD evidence. No self-certification. */
export async function executeHostedRemoteWorkerMission(
    input: HostedRemoteWorkerInput, adapters: HostedRemoteWorkerAdapters
) {
    assertBoundedInput(input, adapters);
    return runHostedApprovedMission(
        adapters.runner, input.request, input.approval, adapters.admission, input.scope,
        (candidate, lease) => candidate.missionId !== input.mission.missionId ? undefined : async () => {
            const startedAt = Date.now();
            const deadlineMs = Math.min(startedAt + adapters.trust.timeoutMs, Date.parse(input.approval.payload.expiresAt));
            if (!(deadlineMs > startedAt + 500)) throw new Error("Hosted remote deadline is exhausted.");
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(new Error("Hosted remote worker timed out.")), deadlineMs - startedAt);
            const binding: RemoteWorkerBinding = Object.freeze({
                authorityId: adapters.trust.authorityId,
                fence: lease.ownerId,
                approvalDigest: createHash("sha256").update(input.approval.signatureBase64).digest("hex"),
                mission: input.mission,
                deadline: new Date(deadlineMs).toISOString()
            });
            let disposed: ReturnType<TrustedRemoteWorkerProvider["dispose"]> | undefined;
            const dispose = () => disposed ??= Promise.resolve().then(() => adapters.provider.dispose(binding));
            const onAbort = () => { void dispose().catch(() => undefined); };
            controller.signal.addEventListener("abort", onAbort, { once: true });
            try {
                if (!(await adapters.admission.assertFencedLease(lease))) throw new Error("Remote worker lease lost.");
                controller.signal.throwIfAborted();
                const provisionEnvelope = structuredClone(await adapters.provider.provision(binding, controller.signal));
                const provision = verifyProvision(binding, provisionEnvelope, adapters.trust, Date.now());
                controller.signal.throwIfAborted();
                if (!(await adapters.admission.assertFencedLease(lease))) throw new Error("Remote worker lease lost.");
                const delivered = structuredClone(await adapters.provider.execute(binding, {
                    title: candidate.title, rationale: candidate.rationale
                }, controller.signal));
                controller.signal.throwIfAborted();
                const remote = verifyRemoteReturn(binding, provision, delivered.receipt, adapters.trust.publicKey, Date.now());
                if (!Array.isArray(delivered.files) || delivered.files.length !== 1 ||
                    delivered.files[0].path !== input.scope.path ||
                    typeof delivered.files[0].contentBase64 !== "string") {
                    throw new Error("Remote worker returned files outside the signed scope.");
                }
                const encoded = delivered.files[0].contentBase64;
                if (encoded.length > 4 * Math.ceil(MAX_REMOTE_FILE_BYTES / 3)) {
                    throw new Error("Remote worker output exceeds its bound.");
                }
                const bytes = Buffer.from(encoded, "base64");
                if (!bytes.length || bytes.length > MAX_REMOTE_FILE_BYTES || bytes.toString("base64") !== encoded ||
                    evidenceDigest(bytes) !== input.scope.contentSha256) {
                    throw new Error("Remote output does not match its approved exact content digest.");
                }
                const manifest = [{ path: input.scope.path, digest: evidenceDigest(bytes) }];
                if (remote.outputsDigest !== evidenceDigest(evidenceJson(manifest))) {
                    throw new Error("Signed remote manifest does not match output bytes.");
                }
                const disposalEnvelope = await dispose();
                if (!disposalEnvelope) throw new Error("Signed remote disposal evidence is mandatory.");
                verifyRemoteDisposal(binding, provision, disposalEnvelope, adapters.trust.publicKey,
                    Date.parse(remote.completedAt), Date.now());
                controller.signal.throwIfAborted();
                if (!(await adapters.admission.assertFencedLease(lease))) throw new Error("Remote worker lease lost.");
                const evidenceId = adapters.trust.archive.preserve({
                    schema: "pbos.mb03.hosted-remote-worker.v1",
                    binding, provision: provisionEnvelope, receipt: delivered.receipt,
                    disposal: disposalEnvelope, manifest
                });
                const sealed = await adapters.sealCheckpoint(Buffer.from(JSON.stringify({
                    schema: "pbos.mb03.hosted-remote-output.v1",
                    missionId: input.mission.missionId, repository: input.mission.repository,
                    revision: input.mission.sourceSha, path: input.scope.path,
                    contentBase64: encoded, remoteEvidenceDigest: evidenceId
                }), "utf8"));
                const version = await adapters.checkpoints.commit(
                    lease, input.mission.missionId, input.mission.repository, 0n, sealed
                );
                controller.signal.throwIfAborted();
                if (!(await adapters.admission.assertFencedLease(lease))) throw new Error("Remote worker lease lost.");
                return {
                    outputs: { revision: input.mission.sourceSha, providerEvidenceDigest: evidenceId },
                    evidenceIds: [evidenceId, "hosted-remote-checkpoint:v" + version.toString()],
                    validations: [{ name: "Signed remote return and disposal; independent acceptance pending",
                        passed: true, durationMs: Date.now() - startedAt, evidenceId }],
                    evidenceNeedsIndependentReview: true
                };
            } finally {
                clearTimeout(timer);
                controller.signal.removeEventListener("abort", onAbort);
                await dispose();
            }
        }
    );
}
