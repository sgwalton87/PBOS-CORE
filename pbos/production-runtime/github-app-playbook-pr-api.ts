/** GitHub App installation-token REST transport for the existing bounded PR adapter.
 * Installation token must be provisioned by the authenticated host; never stored in code.
 * No merge, workflow dispatch, or arbitrary repository writes are exposed.
 */
import type { GitHubPrApi } from "./fenced-playbook-pr-executor";
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
  async createFile(repository:string,branch:string,path:string,content:string,message:string):Promise<void> {
    if(!/^pbos\/mission-[a-zA-Z0-9_-]{1,90}$/.test(branch)||
      !/^docs\/pbos-missions\/[a-zA-Z0-9_-]+\.md$/.test(path))throw new Error("File mutation invalid.");
    await this.api("PUT",`${this.repo(repository)}/contents/${path}`,{
      branch,message,content:Buffer.from(content,"utf8").toString("base64")
    });
  }
  async findPullRequest(repository:string,branch:string,base:string):Promise<{url:string;number:number}|null> {
    if(base!=="main"||!/^pbos\/mission-[a-zA-Z0-9_-]{1,90}$/.test(branch))throw new Error("PR lookup invalid.");
    const response=await this.request(`https://api.github.com${this.repo(repository)}/pulls?state=open&head=sgwalton87%3A${encodeURIComponent(branch)}&base=main&per_page=2`,{
      headers:{"Authorization":`Bearer ${this.token}`,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`GitHub PR lookup failed ${response.status}`);
    const list=await response.json() as Json[];
    if(list.length>1)throw new Error("Multiple matching PRs require reconciliation.");
    if(!list.length)return null;
    return this.validPr(list[0]);
  }
  async createPullRequest(repository:string,branch:string,base:string,title:string,body:string):Promise<{url:string;number:number}> {
    if(base!=="main"||!/^pbos\/mission-[a-zA-Z0-9_-]{1,90}$/.test(branch))throw new Error("PR mutation invalid.");
    const j=await this.api("POST",`${this.repo(repository)}/pulls`,{head:branch,base,title,body,draft:true});
    return this.validPr(j);
  }
  private validPr(j:Json):{url:string;number:number}{
    const url=j.html_url,number=j.number;
    if(typeof url!=="string"||!/^https:\/\/github\.com\/sgwalton87\/playbook-platform\/pull\/\d+$/.test(url)||
      typeof number!=="number"||!Number.isSafeInteger(number)||number<1)throw new Error("Untrusted GitHub PR response.");
    return {url,number};
  }
}
