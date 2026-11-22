import { describe, expect, it } from "vitest";
import type { PlaybookCanonProductGraph } from "../../application-readiness/playbook-canon-product-graph";
import { inspectExistingCanonGraph } from "../canon-graph-evidence";

const sha = "a".repeat(40);
const graph = {
  schemaVersion: 1, repository: "sgwalton87/playbook-platform", revision: sha,
  sources: [{ path: "docs/MASTER_CHECKLIST.md", contentLength: 10, sha256: "b".repeat(64) }],
  phases: [], requirements: [], routes: [], operatingSystems: [],
  onboardingPathways: [], productJourneyIds: [], blockers: [],
  certificationReady: true,
} satisfies PlaybookCanonProductGraph;

describe("Master Builder existing Canon graph evidence", () => {
  it("accepts exact revision of independently compiled, certification-ready graph without authorizing execution", () => {
    expect(inspectExistingCanonGraph(graph, graph.repository, sha)).toMatchObject({
      status: "COMPLETE", blockers: [], executionAuthorized: false,
    });
  });
  it("preserves specific existing Canon compiler blockers", () => {
    const result = inspectExistingCanonGraph({
      ...graph, certificationReady: false, blockers: ["ROLE_JOURNEY_INCOMPLETE:SCHOLAR:PARTIAL"],
    }, graph.repository, sha);
    expect(result.blockers).toContain("ROLE_JOURNEY_INCOMPLETE:SCHOLAR:PARTIAL");
    expect(result.status).toBe("BLOCKED");
  });
  it("rejects stale graph revisions and wrong repositories", () => {
    const result = inspectExistingCanonGraph(graph, "example/other", "c".repeat(40));
    expect(result.blockers).toContain("CANON_REPOSITORY_MISMATCH");
    expect(result.blockers).toContain("CANON_REVISION_MISMATCH");
  });
  it("rejects missing source provenance even with certification flag", () => {
    const result = inspectExistingCanonGraph({ ...graph, sources: [] }, graph.repository, sha);
    expect(result.blockers).toContain("CANON_SOURCE_PROVENANCE_INVALID");
  });
});
