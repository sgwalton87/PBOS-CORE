import { describe, expect, it, vi } from "vitest";
import { generateHostedPlaybookProposal, proposalDigest } from "../pbos/master-builder/hosted-playbook-proposal";
import { hostedMissionScopeDigest } from "../pbos/production-runtime/hosted-signed-mission-approval";

const revision = "a".repeat(40);

function fixture() {
  const documents = ["PPS-010", "PPS-012", "PPS-014", "PPS-015"].map(id => ({ id, file: `${id}_TEST.md`, sha256: proposalDigest(id) }));
  const sources = new Map(documents.map(entry => [`docs/PPS/${entry.file}`, entry.id]));
  const manifest = JSON.stringify({ documents });
  sources.set("docs/PPS/manifest.json", manifest);
  sources.set("package.json", JSON.stringify({ scripts: { typecheck: "tsc" } }));
  sources.set(".github/workflows/ci.yml", "jobs:\n  ci: {}\n");
  sources.set(".github/workflows/platform-qa.yml", "jobs:\n  qa: {}\n");
  const read = vi.fn(async (path: string, sha: string) => {
    expect(sha).toBe(revision);
    if (!sources.has(path)) throw new Error("unexpected source path");
    return sources.get(path)!;
  });
  return { read, sources, manifestSha256: proposalDigest(manifest) };
}

describe("hosted Playbook proposal generation", () => {
  it("creates two distinct repeatable proposals with exact input digests", async () => {
    const { read, manifestSha256 } = fixture();
    const generate = (id: string) => generateHostedPlaybookProposal(id, revision, manifestSha256, read);
    const qa = await generate("MB03-MISSION-001");
    const evidence = await generate("MB03-MISSION-002");
    expect(await generate("MB03-MISSION-001")).toEqual(qa);
    expect(qa.proposal.path).toBe("docs/pbos-missions/MB03-MISSION-001.md");
    expect(evidence.proposal.path).toBe("docs/pbos-missions/MB03-MISSION-002.md");
    expect(qa.contentSha256).toBe(proposalDigest(qa.proposal.content));
    expect(qa.contentSha256).not.toBe(evidence.contentSha256);
    expect(qa.provenance.inputs.map(i => i.path)).toContain(".github/workflows/platform-qa.yml");
    expect(evidence.provenance.inputs.map(i => i.path)).toContain(".github/workflows/ci.yml");
    const scope = { branch: qa.proposal.branch, path: qa.proposal.path, contentSha256: qa.contentSha256 };
    expect(hostedMissionScopeDigest(scope)).not.toBe(hostedMissionScopeDigest({ ...scope, contentSha256: proposalDigest(qa.proposal.content + "x") }));
  });

  it("rejects unreviewed missions and tampered pinned Canon", async () => {
    const { read, sources, manifestSha256 } = fixture();
    await expect(generateHostedPlaybookProposal("unknown", revision, manifestSha256, read)).rejects.toThrow("reviewed mission");
    expect(read).not.toHaveBeenCalled();
    sources.set("docs/PPS/PPS-010_TEST.md", "tampered");
    await expect(generateHostedPlaybookProposal("MB03-MISSION-001", revision, manifestSha256, read)).rejects.toThrow("document hash");
  });
});
