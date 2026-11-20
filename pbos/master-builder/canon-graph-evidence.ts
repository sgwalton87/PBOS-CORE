import type { PlaybookCanonProductGraph } from "../application-readiness/playbook-canon-product-graph";

export type MasterBuilderCanonGraphEvidence = Readonly<{
  status: "COMPLETE" | "BLOCKED";
  repository: string;
  revision: string;
  blockers: readonly string[];
  certificationReady: boolean;
  executionAuthorized: false;
}>;

/**
 * Consumes the existing PlaybookCanonProductGraphCompiler output; never
 * creates an alternative Canon compiler or treats source presence as proof.
 * This is a strict PRODUCT-CERTIFICATION gate, not a license to execute.
 */
export function inspectExistingCanonGraph(
  graph: PlaybookCanonProductGraph,
  repository: string,
  revision: string,
): MasterBuilderCanonGraphEvidence {
  const blockers: string[] = [];
  if (graph.repository !== repository) blockers.push("CANON_REPOSITORY_MISMATCH");
  if (!/^[a-f0-9]{40}$/i.test(revision) || graph.revision !== revision) {
    blockers.push("CANON_REVISION_MISMATCH");
  }
  if (!graph.sources.length || graph.sources.some(source =>
      !source.path || source.contentLength <= 0 || !/^[a-f0-9]{64}$/i.test(source.sha256))) {
    blockers.push("CANON_SOURCE_PROVENANCE_INVALID");
  }
  blockers.push(...graph.blockers);
  if (!graph.certificationReady) blockers.push("CANON_CERTIFICATION_NOT_READY");
  return {
    status: blockers.length ? "BLOCKED" : "COMPLETE",
    repository: graph.repository, revision: graph.revision,
    blockers: [...new Set(blockers)], certificationReady: graph.certificationReady,
    executionAuthorized: false,
  };
}
