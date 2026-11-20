import { describe, expect, it } from "vitest";
import { inspectDisposableCycleEvidence, type MasterBuilderCycleEvidence,
  type MasterBuilderCycleStage } from "../disposable-cycle-evidence";

const sha = "a".repeat(40);
const head = "b".repeat(40);
const stageNames: MasterBuilderCycleStage[] =
  ["SELECT", "PLAN", "BUILD", "TEST", "VERIFY", "DOCUMENT", "PROPOSE"];
function fixture(): MasterBuilderCycleEvidence {
  return {
    mission: { missionId: "test-mission", repository: "sgwalton87/playbook-platform",
      sourceSha: sha, stateNamespace: "disposable-test", environment: "DISPOSABLE" },
    stages: stageNames.map((stage, i) => ({
      stage, passed: true, evidenceId: `test-evidence-${i}`, revision: sha,
      recordedAt: "2026-11-20T00:00:00.000Z",
    })),
    proposal: { repository: "sgwalton87/playbook-platform", branch: "disposable/mb02-test",
      baseSha: sha, headSha: head },
  };
}
describe("MB-02 structural evidence completeness", () => {
  it("recognizes an ordered, scoped, complete disposable record", () => {
    const result = inspectDisposableCycleEvidence(fixture());
    expect(result.complete).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects malformed imported evidence without throwing", () => {
    const original = fixture();
    expect(inspectDisposableCycleEvidence(null as unknown as MasterBuilderCycleEvidence).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, mission: null } as unknown as MasterBuilderCycleEvidence).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, proposal: {
      ...original.proposal, url: 17,
    } } as unknown as MasterBuilderCycleEvidence).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, stages: [
      ...original.stages.slice(0, 2), null, ...original.stages.slice(3),
    ] } as unknown as MasterBuilderCycleEvidence).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, proposal: {
      ...original.proposal, headSha: null,
    } } as unknown as MasterBuilderCycleEvidence).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, stages: null } as unknown as MasterBuilderCycleEvidence).complete).toBe(false);
  });
  it("rejects missing, failed, duplicated and unbound evidence", () => {
    const original = fixture();
    expect(inspectDisposableCycleEvidence({ ...original, stages: original.stages.slice(0, -1) }).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, stages: original.stages.map((s, i) =>
      i === 2 ? { ...s, passed: false } : s) }).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, stages: original.stages.map((s, i) =>
      i === 1 ? { ...s, evidenceId: original.stages[0].evidenceId } : s) }).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, proposal: {
      ...original.proposal, branch: "main" } }).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, proposal: {
      ...original.proposal, headSha: sha } }).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, stages: original.stages.map((stage, i) =>
      ({ ...stage, recordedAt: i === 3 ? "2026-11-19T00:00:00.000Z" :
        "2026-11-20T00:00:00.000Z" })) }).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, proposal: {
      ...original.proposal, url: "https://github.com/untrusted/other/pull/9" } }).complete).toBe(false);
    expect(inspectDisposableCycleEvidence({ ...original, proposal: {
      ...original.proposal, url: "https://github.com/sgwalton87/playbook-platform/pull/9" } }).complete).toBe(true);
    expect(inspectDisposableCycleEvidence({ ...original, mission: {
      ...original.mission, environment: "PRODUCTION" } }).complete).toBe(false);
  });
});
