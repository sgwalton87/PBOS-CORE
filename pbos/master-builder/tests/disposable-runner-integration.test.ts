import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { OperatorIdentityService } from "../../genesis-state/operator-identity";
import { ProductionMissionRunner } from "../../production-runtime/production-mission-runner";
import { ProductionRuntimeService } from "../../production-runtime/production-runtime-service";
import { ProductionMissionAdapterRegistry } from "../../production-runtime/mission-adapter-registry";
import { disposableMissionApprovalScope, inspectScopedDisposableMissionApproval } from "../signed-approval-evidence";
import { runAuthorizedDisposableMission } from "../disposable-authorized-runner";
import type { MasterBuilderMissionBinding } from "../mission-binding-gate";

describe("disposable existing PBOS mission runner integration", () => {
  it("executes one real persisted mission only after independently verifying its scoped HMAC approval", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pbos-master-builder-runner-"));
    try {
      const state = new GenesisStateRepository(join(dir, "genesis.json"));
      const identities = new OperatorIdentityService(join(dir, "operators.json"));
      const { operator, credential } = identities.enroll("disposable-org", "Disposable operator");
      const actor = identities.authenticate(operator.operatorId, credential);
      const mission: MasterBuilderMissionBinding = {
        missionId: "disposable-build-1", repository: "test/disposable",
        sourceSha: "a".repeat(40), stateNamespace: "disposable-state", environment: "DISPOSABLE",
      };
      const scope = disposableMissionApprovalScope(mission);
      const signed = identities.approve(actor, scope.action, scope.resource, 30);
      const authority = inspectScopedDisposableMissionApproval(identities, signed, mission, new Date());
      expect(authority?.verifiedByAuthority).toBe(true);
      if (!authority) throw new Error("Signed approval missing; refusing execution");
      const systemId = "DISPOSABLE-SYSTEM";
      const runtime = new ProductionRuntimeService(state);
      runtime.reconcileQueue(systemId, [{
        missionId: mission.missionId, systemId, title: "Disposable build rehearsal",
        dependencies: [], status: "QUEUED", rationale: "Isolated test mission",
        approvalRequired: true, evidenceIds: [],
      }]);
      const registry = new ProductionMissionAdapterRegistry().register(systemId, mission.missionId,
        () => async () => ({
          outputs: { revision: mission.sourceSha, rehearsal: true },
          evidenceIds: ["disposable:build:validated"],
          validations: [{ name: "Disposable build validation", passed: true,
            durationMs: 1, evidenceId: "disposable:build:validated" }],
        }));
      const request = {
        systemId, actorId: actor.operatorId, authorizationArtifactId: signed.approvalId,
        repository: mission.repository, branch: "disposable/mission-1", commit: mission.sourceSha,
        approvedMissionIds: [mission.missionId], maximumMissions: 1, autonomousContinuation: false,
        buildChannel: {
          channelId: "disposable-channel", systemId, operatingSystemId: "disposable-os",
          connectorId: "disposable-connector", repository: mission.repository,
          domainRegistrationIds: ["disposable-domain"],
        },
      };
      await expect(runAuthorizedDisposableMission(
        new ProductionMissionRunner(state, runtime), identities, signed,
        { ...mission, missionId: "another-mission" }, request,
        candidate => registry.resolve(candidate), new Date())).rejects.toThrow(/approval|signature/i);
      expect(state.productionRuns()).toHaveLength(0);
      await expect(runAuthorizedDisposableMission(
        new ProductionMissionRunner(state, runtime), identities, signed, mission,
        { ...request, actorId: "different-operator" },
        candidate => registry.resolve(candidate), new Date())).rejects.toThrow(/approval boundary/i);
      expect(state.productionRuns()).toHaveLength(0);
      const sequence = await runAuthorizedDisposableMission(
        new ProductionMissionRunner(state, runtime), identities, signed, mission, request,
        candidate => registry.resolve(candidate), new Date());
      expect(sequence.stopReason).toBe("APPROVAL_REQUIRED");
      expect(sequence.runs).toHaveLength(1);
      expect(sequence.runs[0].status).toBe("AWAITING_APPROVAL");
      expect(sequence.runs[0].evidenceIds).toContain("disposable:build:validated");
      expect(state.productionEvents(sequence.runs[0].runId).length).toBeGreaterThan(0);
      expect(state.missionQueue(systemId).find(candidate => candidate.missionId === mission.missionId)?.status)
        .toBe("ACTIVE");
      expect(state.executionLeases().at(-1)?.status).toBe("RELEASED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
