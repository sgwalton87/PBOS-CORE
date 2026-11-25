import { readFileSync, writeFileSync } from "node:fs";
import { hostedMissionScopeDigest, verifyHostedMissionApproval, type HostedMissionScope, type SignedHostedMissionApproval } from "../production-runtime/hosted-signed-mission-approval";
import { createRemotePlaybookMission, assertPlaybookRemoteTarget, PLAYBOOK_REMOTE_REPOSITORY, type PlaybookRemoteTarget } from "../master-builder/playbook-remote-mission";
import type { HostedRemoteWorkerInput } from "../production-runtime/hosted-remote-worker-mission";
import type { ProductionMissionRequest } from "../production-runtime/production-mission-runner";
import type { Mb03Mission } from "../master-builder/mb03-disposable-mission";

export interface MissionPackageSpec {
  readonly approval: SignedHostedMissionApproval;
  readonly target: PlaybookRemoteTarget;
  readonly operatorPublicKeyPem: string;
  readonly workerId: string;
  readonly stateNamespace: string;
  readonly systemId: string;
  readonly channelId: string;
  readonly operatingSystemId: string;
  readonly connectorId: string;
  readonly domainRegistrationIds: readonly string[];
}

export type HostedMissionPackage = HostedRemoteWorkerInput & { readonly target: PlaybookRemoteTarget };

/** Builds the exact controller input. It never signs, uploads, or executes. */
export function buildMissionPackage(spec: MissionPackageSpec): HostedMissionPackage {
  const { approval, target } = spec;
  const targetInfo = assertPlaybookRemoteTarget(target);
  const scope: HostedMissionScope = {
    branch: `pbos/mission-${target.missionId}`,
    path: targetInfo.path,
    contentSha256: targetInfo.afterSha256
  };
  if (approval.payload.repository !== PLAYBOOK_REMOTE_REPOSITORY ||
      approval.payload.missionId !== target.missionId ||
      approval.payload.scopeDigest !== hostedMissionScopeDigest(scope) ||
      !verifyHostedMissionApproval(approval, {
        missionId: target.missionId,
        repository: PLAYBOOK_REMOTE_REPOSITORY,
        commit: approval.payload.commit,
        operatorId: approval.payload.operatorId,
        scope
      }, spec.operatorPublicKeyPem)) {
    throw new Error("Signed mission package does not match the exact target scope or is expired/invalid.");
  }
  const mission: Mb03Mission = createRemotePlaybookMission(
    approval.payload.commit, spec.workerId, spec.stateNamespace, approval.payload.nonce, target);
  const request: ProductionMissionRequest = {
    systemId: spec.systemId,
    actorId: approval.payload.operatorId,
    authorizationArtifactId: `hosted-approval:${approval.payload.nonce}`,
    repository: PLAYBOOK_REMOTE_REPOSITORY,
    branch: scope.branch,
    commit: approval.payload.commit,
    approvedMissionIds: [target.missionId],
    autonomousContinuation: false,
    maximumMissions: 1,
    buildChannel: {
      channelId: spec.channelId,
      systemId: spec.systemId,
      operatingSystemId: spec.operatingSystemId,
      connectorId: spec.connectorId,
      repository: PLAYBOOK_REMOTE_REPOSITORY,
      domainRegistrationIds: [...spec.domainRegistrationIds]
    }
  };
  return { request, approval, mission, scope, target };
}

if (require.main === module) {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error("Usage: mb03-mission-package <spec.json> <package.json>");
  const spec = JSON.parse(readFileSync(inputPath, "utf8")) as MissionPackageSpec;
  const pkg = buildMissionPackage(spec);
  writeFileSync(outputPath, JSON.stringify(pkg) + "\n", { mode: 0o600 });
  process.stdout.write(JSON.stringify({ status: "PACKAGE_VERIFIED", missionId: pkg.mission.missionId, nonce: pkg.approval.payload.nonce, commit: pkg.approval.payload.commit }) + "\n");
}
