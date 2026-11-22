/**
 * MB04 bounded GitHub PR side-effect adapter.
 * The host supplies a scoped GitHub App installation API and the real Neon fence.
 * Never merges, deploys, pushes to main, or creates more than one file/PR.
 * GitHub itself does not support fencing tokens: stale workers are checked before
 * each call and must be prevented from concurrent mutation by the lease service.
 */
import type { HostedExecutionLease } from "./hosted-approved-mission";

export interface GitHubPrApi {
  getBranchSha(repository: string, branch: string): Promise<string>;
  createBranch(repository: string, branch: string, fromSha: string): Promise<void>;
  createFile(repository: string, branch: string, path: string, content: string, message: string): Promise<void>;
  createPullRequest(repository: string, branch: string, base: string, title: string, body: string): Promise<{url:string;number:number}>;
  findPullRequest(repository: string, branch: string, base: string): Promise<{url:string;number:number}|null>;
}
export interface FencedPrResult { readonly url: string; readonly number: number; readonly branch: string; }
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
  await fence();
  const existing = await api.findPullRequest(input.repository,input.branch,"main");
  if (existing) return {...existing,branch:input.branch};
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
  await api.createFile(input.repository,input.branch,input.path,input.content,
    `docs(pbos): record bounded mission ${input.missionId}`);
  await fence();
  const pr=await api.createPullRequest(input.repository,input.branch,"main",input.title,input.body);
  if (!/^https:\/\/github\.com\/sgwalton87\/playbook-platform\/pull\/\d+$/.test(pr.url)) {
    throw new Error("GitHub returned untrusted Playbook PR URL.");
  }
  return {...pr,branch:input.branch};
}
