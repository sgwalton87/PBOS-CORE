import { createHash } from "node:crypto";
import type { ProductionRun } from "./contracts";
import type { HostedExecutionLease } from "./hosted-approved-mission";
import { createFencedPlaybookPr } from "./fenced-playbook-pr-executor";
import type { GitHubAppPlaybookPrApi } from "./github-app-playbook-pr-api";
import { verifyPlanReadyRecoveryApproval, type HostedMissionScope, type PlanReadyRecoveryAuthorization } from "./hosted-signed-mission-approval";

/** The controller supplies the authenticated output checkpoint and the persisted
 * paused run. GitHub writes still use the ordinary exact-base fenced adapter. */
export async function publishPlanReadyOutput(github: GitHubAppPlaybookPrApi, fence: HostedExecutionLease,
    assertLease: (fence: HostedExecutionLease) => Promise<boolean>, run: ProductionRun,
    recovery: PlanReadyRecoveryAuthorization, scope: HostedMissionScope, publicKey: string, checkpoint: Uint8Array) {
    const { pin, approval, publicationBase } = recovery;
    const expected = { missionId: pin.missionId, repository: run.repository, commit: run.startingCommit, operatorId: run.actorId, scope };
    const authorized = () => verifyPlanReadyRecoveryApproval(recovery, expected, publicKey);
    if (!authorized() || run.runId !== pin.runId || run.status !== "PAUSED" ||
        run.repository !== "sgwalton87/playbook-platform" || run.currentCommit !== pin.commit || run.currentBranch !== scope.branch ||
        run.authorizationArtifactId !== "hosted-approval:" + pin.nonce || run.disposableAttempt?.attemptId !== pin.nonce ||
        run.disposableAttempt?.scopeDigest !== pin.scopeDigest || run.disposableAttempt?.missionId !== pin.missionId ||
        !run.evidenceIds.includes("hosted-remote-checkpoint:v1")) {
        throw Error("RECOVERY_PUBLICATION_AUTHORITY");
    }
    if (!checkpoint.byteLength || checkpoint.byteLength > 32_768 ||
        !run.evidenceIds.includes("recovered-output:" + createHash("sha256").update(checkpoint).digest("hex"))) {
        throw Error("RECOVERY_CHECKPOINT_DIGEST");
    }
    const out = JSON.parse(Buffer.from(checkpoint).toString("utf8")) as Record<string, unknown>;
    if (out.schema !== "pbos.mb03.hosted-remote-output.v1" || out.missionId !== pin.missionId || out.repository !== pin.repository ||
        out.revision !== pin.commit || out.recoveryRunId !== pin.runId || out.recoveryNonce !== approval.payload.nonce ||
        out.recoveryApprovalDigest !== createHash("sha256").update(approval.signatureBase64).digest("hex") ||
        out.publicationBase !== publicationBase || out.path !== scope.path || typeof out.remoteEvidenceDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(out.remoteEvidenceDigest) || !run.evidenceIds.includes(out.remoteEvidenceDigest) ||
        typeof out.contentBase64 !== "string" || out.contentBase64.length > 26668) throw Error("RECOVERY_OUTPUT_LINEAGE");
    const bytes = Buffer.from(out.contentBase64, "base64");
    if (bytes.toString("base64") !== out.contentBase64 || createHash("sha256").update(bytes).digest("hex") !== scope.contentSha256) {
        throw Error("RECOVERY_OUTPUT_DIGEST");
    }
    const content = bytes.toString("utf8");
    if (!Buffer.from(content).equals(bytes)) throw Error("RECOVERY_OUTPUT_ENCODING");
    await github.assertRecoveryPublicationBase(pin.repository, pin.commit, publicationBase);
    return createFencedPlaybookPr(github, fence, async lease => await assertLease(lease) && authorized(), {
        repository: run.repository, baseSha: publicationBase, missionId: pin.missionId, branch: scope.branch,
        path: scope.path, content, title: "Review " + pin.missionId + " bounded Playbook change",
        body: "Recovered run " + pin.runId + " produced this proposed edit from source " + pin.commit +
            ". Signed worker evidence SHA-256: " + out.remoteEvidenceDigest + "."
    });
}
