/** GitHub App installation-token transport for the existing bounded PR adapter.
 * Installation token must be provisioned by the authenticated host; never stored in code.
 * No merge, workflow dispatch, or arbitrary repository writes are exposed.
 */
import type { FencedPrInput, GithubDraftReference, GitHubPrApi } from "./fenced-playbook-pr-executor";
type Json = Record<string,unknown>;
export class GitHubAppPlaybookPrApi implements GitHubPrApi {
  constructor(private readonly token: string, private readonly request: typeof fetch = fetch) {
    if (!token.trim()) throw new Error("Missing GitHub App installation token.");
  }
  private async api(method: string, path: string, body?: Json): Promise<Json> {
    const response=await this.request(`https://api.github.com${path}`,{
      method,headers:{"Authorization":`Bearer ${this.token}`,"Accept":"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      if(response.status===404 && path.includes("/git/ref/heads/")) throw new Error("GITHUB_BRANCH_NOT_FOUND");
      throw new Error(`GitHub App API ${method} ${response.status}`);
    }
    return response.status===204?{}:await response.json() as Json;
  }
  private repo(repository:string):string {
    if(repository!=="sgwalton87/playbook-platform")throw new Error("GitHub App repository not allowlisted.");
    return "/repos/sgwalton87/playbook-platform";
  }
  async readPinnedProposalSource(path: string, sha: string): Promise<string> {
    if (!/^[a-f0-9]{40}$/.test(sha) ||
        !/^(package\.json|\.github\/workflows\/(ci|platform-qa)\.yml|docs\/PPS\/(manifest\.json|PPS-\d{3,4}_[A-Za-z0-9_]+\.md))$/.test(path)) {
      throw new Error("Pinned proposal source is not allowlisted.");
    }
    const j = await this.api("GET", `${this.repo("sgwalton87/playbook-platform")}/contents/${path}?ref=${sha}`);
    if (j.type !== "file" || j.path !== path || j.encoding !== "base64" ||
        typeof j.content !== "string" || j.content.length > 360000) throw new Error("Invalid pinned proposal source response.");
    const content = j.content.replace(/\s/g, "");
    const bytes = Buffer.from(content, "base64");
    if (bytes.toString("base64") !== content) throw new Error("Invalid pinned proposal source encoding.");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  async getBranchSha(repository:string,branch:string):Promise<string> {
    if(!/^(main|pbos\/mission-[a-zA-Z0-9_-]{1,90})$/.test(branch))throw new Error("GitHub branch not allowlisted.");
    const j=await this.api("GET",`${this.repo(repository)}/git/ref/heads/${branch}`);
    const sha=(j.object as Json|undefined)?.sha;
    if(typeof sha!=="string"||!/^[a-f0-9]{40}$/i.test(sha))throw new Error("GitHub ref SHA invalid.");
    return sha;
  }
  async getFileContent(repository:string,branch:string,path:string):Promise<string> {
    if(!/^pbos\/mission-[a-zA-Z0-9_-]{1,90}$/.test(branch)||
      !/^docs\/pbos-missions\/[a-zA-Z0-9_-]+\.md$/.test(path))throw new Error("GitHub file read is not allowlisted.");
    const j=await this.api("GET",`${this.repo(repository)}/contents/${path}?ref=${encodeURIComponent(branch)}`);
    if(j.encoding!=="base64"||typeof j.content!=="string"||j.content.length>30000)throw new Error("GitHub file response invalid.");
    const compact=j.content.replace(/\s/g,"");
    const decoded=Buffer.from(compact,"base64");
    if(decoded.toString("base64")!==compact)throw new Error("GitHub file response encoding invalid.");
    return decoded.toString("utf8");
  }
  async createBranch(repository:string,branch:string,fromSha:string):Promise<void> {
    if(!/^pbos\/mission-[a-zA-Z0-9_-]{1,90}$/.test(branch)||!/^[a-f0-9]{40}$/i.test(fromSha))throw new Error("Branch mutation invalid.");
    await this.api("POST",`${this.repo(repository)}/git/refs`,{ref:`refs/heads/${branch}`,sha:fromSha});
  }
  async getTrackedFileBlob(repository: string, revision: string, path: string): Promise<string> {
    if (!/^[a-f0-9]{40}$/.test(revision) || !/^docs\/pbos-missions\/MB03-MISSION-(001|002)\.md$/.test(path)) {
      throw new Error("Tracked mission tree lookup is outside its allowed scope.");
    }
    const result = await this.api("GET", `${this.repo(repository)}/git/trees/${revision}?recursive=1`);
    if (result.truncated !== false || !Array.isArray(result.tree)) throw new Error("Incomplete mission Git tree.");
    const matching = result.tree.filter(entry => entry?.path === path);
    const entry = matching[0];
    if (matching.length !== 1 || entry.type !== "blob" || entry.mode !== "100644" ||
        typeof entry.sha !== "string" || !/^[a-f0-9]{40}$/.test(entry.sha)) {
      throw new Error("Expected exactly one tracked regular mission document.");
    }
    return entry.sha;
  }
  async assertSingleTrackedEdit(input: FencedPrInput, head: string, outputBlob: string): Promise<void> {
    if (await this.getTrackedFileBlob(input.repository, head, input.path) !== outputBlob) {
      throw new Error("Mission head has different file bytes.");
    }
    const commit = await this.api("GET", `${this.repo(input.repository)}/commits/${head}?per_page=2`);
    if (commit.sha !== head || !Array.isArray(commit.parents) || commit.parents.length !== 1 ||
        commit.parents[0]?.sha !== input.baseSha || !Array.isArray(commit.files) || commit.files.length !== 1 ||
        commit.files[0]?.filename !== input.path || commit.files[0]?.status !== "modified" ||
        commit.files[0]?.sha !== outputBlob) {
      throw new Error("Mission head must contain only the approved edit directly on the pinned base.");
    }
  }
  async updateTrackedFile(input: FencedPrInput): Promise<string> {
    this.repo(input.repository);
    if (!/^MB03-MISSION-(001|002)$/.test(input.missionId) || input.branch !== `pbos/mission-${input.missionId}` ||
        input.path !== `docs/pbos-missions/${input.missionId}.md` || !/^[a-f0-9]{40}$/.test(input.baseSha)) {
      throw new Error("Tracked mission commit is outside the allowed scope.");
    }
    // The Contents API's blob precondition cannot fence a concurrent change to a
    // different path on this branch. GitHub checks expectedHeadOid atomically.
    const result = await this.api("POST", "/graphql", {
      query: "mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }",
      variables: { input: {
        branch: { repositoryNameWithOwner: input.repository, branchName: input.branch },
        expectedHeadOid: input.baseSha,
        message: { headline: `docs(pbos): record bounded mission ${input.missionId}` },
        fileChanges: { additions: [{ path: input.path, contents: Buffer.from(input.content).toString("base64") }] }
      } }
    });
    const data = result.data as { createCommitOnBranch?: {commit?: {oid?: string}} } | undefined;
    const head = data?.createCommitOnBranch?.commit?.oid;
    if (result.errors || typeof head !== "string" || !/^[a-f0-9]{40}$/.test(head)) {
      throw new Error("GitHub did not confirm a conditional tracked-file commit.");
    }
    return head;
  }
  async createFile(repository:string,branch:string,path:string,content:string,message:string):Promise<void> {
    if(!/^pbos\/mission-[a-zA-Z0-9_-]{1,90}$/.test(branch)||
      !/^docs\/pbos-missions\/[a-zA-Z0-9_-]+\.md$/.test(path))throw new Error("File mutation invalid.");
    await this.api("PUT",`${this.repo(repository)}/contents/${path}`,{
      branch,message,content:Buffer.from(content,"utf8").toString("base64")
    });
  }
  async findPullRequest(repository:string,branch:string,base:string):Promise<GithubDraftReference|null> {
    if(base!=="main"||!/^pbos\/mission-[a-zA-Z0-9_-]{1,90}$/.test(branch))throw new Error("PR lookup invalid.");
    const state = /^pbos\/mission-MB03-MISSION-(001|002)$/.test(branch) ? "all" : "open";
    const response=await this.request(`https://api.github.com${this.repo(repository)}/pulls?state=${state}&head=sgwalton87%3A${encodeURIComponent(branch)}&base=main&per_page=2`,{
      headers:{"Authorization":`Bearer ${this.token}`,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`GitHub PR lookup failed ${response.status}`);
    const list=await response.json() as Json[];
    if(!Array.isArray(list))throw new Error("Invalid GitHub PR lookup response.");
    if(list.length>1)throw new Error("Multiple matching PRs require reconciliation.");
    if(!list.length)return null;
    return this.validPr(list[0], repository, branch);
  }
  async createPullRequest(repository:string,branch:string,base:string,title:string,body:string):Promise<GithubDraftReference> {
    if(base!=="main"||!/^pbos\/mission-[a-zA-Z0-9_-]{1,90}$/.test(branch))throw new Error("PR mutation invalid.");
    const j=await this.api("POST",`${this.repo(repository)}/pulls`,{head:branch,base,title,body,draft:true});
    return this.validPr(j, repository, branch);
  }
  private validPr(j:Json, repository:string, branch:string):GithubDraftReference{
    const url=j.html_url,number=j.number;
    if(typeof url!=="string"||!/^https:\/\/github\.com\/sgwalton87\/playbook-platform\/pull\/\d+$/.test(url)||
      typeof number!=="number"||!Number.isSafeInteger(number)||number<1)throw new Error("Untrusted GitHub PR response.");
    if (/^pbos\/mission-MB03-MISSION-(001|002)$/.test(branch)) {
      const head = j.head as Json | undefined;
      const base = j.base as Json | undefined;
      if (url !== `https://github.com/${repository}/pull/${number}` || j.state !== "open" || j.draft !== true ||
          head?.ref !== branch || typeof head.sha !== "string" || !/^[a-f0-9]{40}$/.test(head.sha) ||
          (head.repo as Json | undefined)?.full_name !== repository ||
          base?.ref !== "main" || typeof base.sha !== "string" || !/^[a-f0-9]{40}$/.test(base.sha) ||
          (base.repo as Json | undefined)?.full_name !== repository) {
        throw new Error("Untrusted mission draft PR lineage.");
      }
      return {url,number,headSha:head.sha,baseSha:base.sha};
    }
    return {url,number};
  }
}
