import { describe, expect, it } from "vitest";
import type { MissionQueueItem } from "../../production-runtime/contracts";
import { previewMasterBuilderMission } from "../mission-selection-preview";
import type { MasterBuilderReadiness } from "../readiness-gate";

const ready: MasterBuilderReadiness = {
  decision: "ELIGIBLE_FOR_SEPARATE_AUTHORIZATION", blockers: [], executionAuthorized: false,
};
const mission = (missionId: string, dependencies: string[] = [], status: MissionQueueItem["status"] = "QUEUED"): MissionQueueItem => ({
  missionId, systemId: "synthetic", title: missionId, dependencies, status,
  rationale: "", approvalRequired: true, evidenceIds: [],
});

describe("Master Builder governed queue preview", () => {
  it("uses existing queue ordering and dependencies without execution", () => {
    const items = [mission("first", [], "COMPLETE"), mission("second", ["first"]), mission("third")];
    const snapshot = JSON.stringify(items);
    expect(previewMasterBuilderMission(items, ready)).toEqual({
      status: "CANDIDATE",
      candidate: { missionId: "second", systemId: "synthetic", title: "second" },
      blockers: [], executionAuthorized: false,
    });
    expect(JSON.stringify(items)).toBe(snapshot);
  });
  it("refuses to select when integrity or approval gate blocks", () => {
    const result = previewMasterBuilderMission([mission("first")], {
      decision: "BLOCKED", blockers: ["GENESIS_INVALID"], executionAuthorized: false,
    });
    expect(result).toMatchObject({ status: "BLOCKED", candidate: null,
      blockers: ["GENESIS_INVALID"], executionAuthorized: false });
  });
  it("preserves existing queue's active mission stop rule", () => {
    const result = previewMasterBuilderMission([mission("running", [], "ACTIVE"), mission("next")], ready);
    expect(result).toMatchObject({ status: "BLOCKED", candidate: null,
      blockers: ["QUEUE_ACTIVE_OR_EXECUTION_BLOCKED"] });
  });
  it("preserves existing queue's execution-blocker stop rule", () => {
    const result = previewMasterBuilderMission([
      { ...mission("blocked"), executionBlocker: "CANON_EVIDENCE_MISSING" }, mission("next"),
    ], ready);
    expect(result.status).toBe("BLOCKED");
  });
  it("rejects unknown dependencies and duplicate mission IDs", () => {
    expect(previewMasterBuilderMission([mission("a", ["unknown"])], ready).blockers).toContain("QUEUE_INVALID");
    expect(previewMasterBuilderMission([mission("a"), mission("a")], ready).blockers).toContain("QUEUE_INVALID");
  });
  it("returns no candidate for an empty queue", () => {
    expect(previewMasterBuilderMission([], ready)).toMatchObject({
      status: "EMPTY", candidate: null, blockers: ["NO_ELIGIBLE_MISSION"],
    });
  });
});
