import { createHash } from "node:crypto";
import type { MissionQueueItem } from "./contracts";
import { createFencedPlaybookPr, type FencedPrInput, type GitHubPrApi } from "./fenced-playbook-pr-executor";
import { runHostedApprovedMission, type HostedExecutionDependencies, type HostedExecutionLease } from "./hosted-approved-mission";
import type { SignedHostedMissionApproval } from "./hosted-signed-mission-approval";
import type { NeonFencedMissionCheckpoint } from "./neon-fenced-mission-checkpoint";
import type { ProductionMissionRequest, ProductionMissionRunner, ProductionMissionSequence } from "./production-mission-runner";

export const HOSTED_MISSION_EVIDENCE_STAGES = [
  "SELECT", "PLAN", "BUILD", "TEST", "VERIFY", "DOCUMENT", "PROPOSE"
] as const;

export interface HostedPlaybookMissionInput {
  readonly request: ProductionMissionRequest;
  readonly approval: SignedHostedMissionApproval;
  readonly proposal: FencedPrInput;
}

export interface HostedPlaybookMissionAdapters {
  readonly runner: ProductionMissionRunner;
  readonly admission: HostedExecutionDependencies;
  readonly checkpoints: NeonFencedMissionCheckpoint;
  readonly github: GitHubPrApi;
  readonly sealCheckpoint: (plaintext: Uint8Array) => Promise<Uint8Array>;
}

function contentSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function checkpointPayload(
  phase: "ADMITTED" | "PROPOSED",
  input: HostedPlaybookMissionInput,
  extra: Readonly<Record<string, unknown>> = {}
): Uint8Array {
  return Buffer.from(JSON.stringify({
    schema: "pbos.hosted-mission-checkpoint.v1",
    phase,
    missionId: input.proposal.missionId,
    repository: input.proposal.repository,
    baseSha: input.proposal.baseSha,
    branch: input.proposal.branch,
    path: input.proposal.path,
    contentSha256: contentSha256(input.proposal.content),
    approvalNonce: input.approval.payload.nonce,
    evidenceStages: HOSTED_MISSION_EVIDENCE_STAGES,
    ...extra
  }), "utf8");
}

function assertExactInput(input: HostedPlaybookMissionInput): void {
  const { request, approval, proposal } = input;
  if (request.repository !== "sgwalton87/playbook-platform" ||
      proposal.repository !== request.repository ||
      proposal.baseSha !== request.commit ||
      proposal.missionId !== approval.payload.missionId ||
      request.approvedMissionIds?.length !== 1 ||
      request.approvedMissionIds[0] !== proposal.missionId ||
      request.branch !== "main" ||
      request.autonomousContinuation !== false ||
      request.maximumMissions !== 1) {
    throw new Error("Hosted Playbook mission request, approval and proposal lineage differ.");
  }
}

export async function executeHostedPlaybookMission(
  input: HostedPlaybookMissionInput,
  adapters: HostedPlaybookMissionAdapters
): Promise<ProductionMissionSequence> {
  assertExactInput(input);
  const scope = {
    branch: input.proposal.branch,
    path: input.proposal.path,
    contentSha256: contentSha256(input.proposal.content)
  };
  return runHostedApprovedMission(
    adapters.runner,
    input.request,
    input.approval,
    adapters.admission,
    scope,
    (mission: MissionQueueItem, lease: HostedExecutionLease) => {
      if (mission.missionId !== input.proposal.missionId) return undefined;
      return async () => {
        const admitted = await adapters.sealCheckpoint(checkpointPayload("ADMITTED", input));
        const admittedVersion = await adapters.checkpoints.commit(
          lease, mission.missionId, input.request.repository, 0n, admitted
        );
        const pullRequest = await createFencedPlaybookPr(
          adapters.github, lease, adapters.admission.assertFencedLease, input.proposal
        );
        const revision = await adapters.github.getBranchSha(input.request.repository, pullRequest.branch);
        const proposed = await adapters.sealCheckpoint(checkpointPayload("PROPOSED", input, {
          pullRequestUrl: pullRequest.url,
          pullRequestNumber: pullRequest.number,
          revision,
          admittedVersion: admittedVersion.toString()
        }));
        await adapters.checkpoints.commit(
          lease, mission.missionId, input.request.repository, admittedVersion, proposed
        );
        const evidenceIds = HOSTED_MISSION_EVIDENCE_STAGES.map(stage =>
          `hosted:${mission.missionId}:${stage.toLowerCase()}:${revision}`
        );
        return {
          outputs: {
            branch: pullRequest.branch,
            revision,
            pullRequestUrl: pullRequest.url,
            pullRequestNumber: pullRequest.number
          },
          evidenceIds,
          files: { added: [input.proposal.path] },
          commands: [{ command: "github-app:create-bounded-draft-pr", exitCode: 0, durationMs: 0 }],
          validations: [
            { name: "exact signed mission scope", passed: true, durationMs: 0, evidenceId: evidenceIds[1] },
            { name: "fenced draft PR creation", passed: true, durationMs: 0, evidenceId: evidenceIds[6] },
            { name: "durable encrypted checkpoint", passed: true, durationMs: 0, evidenceId: evidenceIds[4] }
          ]
        };
      };
    }
  );
}
