/**
 * MB04 bounded GitHub PR side-effect adapter.
 * The host supplies a scoped GitHub App installation API and the real Neon fence.
 * Never merges, deploys, pushes to main, or creates more than one file/PR.
 * GitHub itself does not support fencing tokens: stale workers are checked before
 * each call and must be prevented from concurrent mutation by the lease service.
 */
import { createHash } from "node:crypto";
import type { HostedExecutionLease } from "./hosted-approved-mission";

export interface GithubDraftReference {
  readonly url: string;
  readonly number: number;
  readonly headSha?: string;
  readonly baseSha?: string;
}

export interface GitHubPrApi {
  getBranchSha(repository: string, branch: string): Promise<string>;
  getFileContent(repository: string, branch: string, path: string): Promise<string>;
  createBranch(repository: string, branch: string, fromSha: string): Promise<void>;
  getTrackedFileBlob(repository: string, revision: string, path: string): Promise<string>;
  assertSingleTrackedEdit(input: FencedPrInput, revision: string, outputBlob: string): Promise<void>;
  updateTrackedFile(input: FencedPrInput): Promise<string>;
  createFile(repository: string, branch: string, path: string, content: string, message: string): Promise<void>;
  createPullRequest(repository: string, branch: string, base: string, title: string, body: string): Promise<GithubDraftReference>;
  findPullRequest(repository: string, branch: string, base: string): Promise<GithubDraftReference|null>;
}
export interface FencedPrResult extends GithubDraftReference {
  readonly branch: string;
  readonly fileOperation: "added" | "modified";
}
export interface FencedPrInput {
  readonly repository: "sgwalton87/playbook-platform";
  readonly baseSha: string;
  readonly missionId: string;
  readonly branch: string;
  readonly path: string;
  readonly content: string;
  readonly title: string;
  readonly body: string;
}
export async function createFencedPlaybookPr(
  api: GitHubPrApi,
  lease: HostedExecutionLease,
  assertLease: (lease: HostedExecutionLease) => Promise<boolean>,
  input: FencedPrInput
): Promise<FencedPrResult> {
  if (input.repository !== "sgwalton87/playbook-platform" ||
      !/^[a-f0-9]{40}$/i.test(input.baseSha) ||
      !/^[a-zA-Z0-9_-]{1,90}$/.test(input.missionId) ||
      input.branch !== `pbos/mission-${input.missionId}` ||
      !/^docs\/pbos-missions\/[a-zA-Z0-9_-]+\.md$/.test(input.path) ||
      input.path !== `docs/pbos-missions/${input.missionId}.md` ||
      input.content.length < 1 || input.content.length > 20000 ||
      !input.title.trim() || !input.body.trim() ||
      lease.resource !== `pbos:mission:${input.repository}:${input.missionId}` ||
      lease.fencingToken < 1n) {
    throw new Error("Bounded Playbook PR mission lineage or payload invalid.");
  }
  const fence = async () => {
    if (!(await assertLease(lease))) throw new Error("Fenced lease lost: refusing GitHub mutation.");
  };
  await fence();
  const base = await api.getBranchSha(input.repository,"main");
  if (base !== input.baseSha) throw new Error("Playbook main advanced: mission requires new signed approval.");
  const tracked = /^MB03-MISSION-(001|002)$/.test(input.missionId);
  const bytes = Buffer.from(input.content, "utf8");
  const outputBlob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  await fence();
  const previousBlob = tracked ? await api.getTrackedFileBlob(input.repository, base, input.path) : undefined;
  if (tracked && previousBlob === outputBlob) throw new Error("Tracked mission proposes no change.");
  const verifyHead = async () => {
    const head = await api.getBranchSha(input.repository, input.branch);
    await api.assertSingleTrackedEdit(input, head, outputBlob);
    return head;
  };
  await fence();
  const existing = await api.findPullRequest(input.repository,input.branch,"main");
  if (existing) {
    await fence();
    if (tracked) {
      const head = await verifyHead();
      if (existing.headSha !== head || existing.baseSha !== base) throw new Error("Existing draft PR head differs from the verified edit.");
    }
    const content = await api.getFileContent(input.repository,input.branch,input.path);
    if (content !== input.content) throw new Error("Existing mission PR content differs from the signed payload.");
    return {...existing, branch: input.branch, fileOperation: tracked ? "modified" : "added"};
  }
  await fence();
  // An existing branch without a PR is NOT reused: unknown content could be overwritten.
  let branchExists = false;
  try { await api.getBranchSha(input.repository,input.branch); branchExists=true; }
  catch (error) {
    if (!(error instanceof Error) || error.message !== "GITHUB_BRANCH_NOT_FOUND") throw error;
  }
  if (branchExists) throw new Error("Mission branch already exists without a PR; manual reconciliation required.");
  await fence();
  await api.createBranch(input.repository,input.branch,input.baseSha);
  await fence();
  let writtenHead: string | undefined;
  if (tracked) {
    writtenHead = await api.updateTrackedFile(input);
  } else {
    await api.createFile(input.repository,input.branch,input.path,input.content,
      `docs(pbos): record bounded mission ${input.missionId}`);
  }
  await fence();
  const verifiedHead = tracked ? await verifyHead() : undefined;
  if (tracked && verifiedHead !== writtenHead) throw new Error("Mission branch moved after conditional commit.");
  await fence();
  const pr=await api.createPullRequest(input.repository,input.branch,"main",input.title,input.body);
  if (!/^https:\/\/github\.com\/sgwalton87\/playbook-platform\/pull\/\d+$/.test(pr.url)) {
    throw new Error("GitHub returned untrusted Playbook PR URL.");
  }
  if (tracked && (pr.headSha !== verifiedHead || pr.baseSha !== base)) throw new Error("New draft PR head differs from the verified edit.");
  return {...pr, branch: input.branch, fileOperation: tracked ? "modified" : "added"};
}
