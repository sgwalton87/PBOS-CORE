import { describe,it,expect,vi } from "vitest";
import { GitHubAppPlaybookPrApi } from "../pbos/production-runtime/github-app-playbook-pr-api";
describe("GitHub App Playbook transport",()=>{
 it("uses installation auth and opens a draft PR only in Playbook",async()=>{
  const fetcher=vi.fn(async (_url:string,opts:RequestInit)=>new Response(JSON.stringify({html_url:"https://github.com/sgwalton87/playbook-platform/pull/42",number:42}),{status:201}));
  const api=new GitHubAppPlaybookPrApi("test-installation-token",fetcher as unknown as typeof fetch);
  expect(await api.createPullRequest("sgwalton87/playbook-platform","pbos/mission-smoke1","main","Smoke","Evidence")).toEqual({url:"https://github.com/sgwalton87/playbook-platform/pull/42",number:42});
  expect(fetcher).toHaveBeenCalledOnce();
  const [url,options]=fetcher.mock.calls[0] as [string,RequestInit];
  expect(url).toContain("/repos/sgwalton87/playbook-platform/pulls");
  expect((options.headers as Record<string,string>).Authorization).toBe("Bearer test-installation-token");
  expect(JSON.parse(options.body as string).draft).toBe(true);
 });
 it("rejects wrong repository without network access",async()=>{
  const fetcher=vi.fn();
  const api=new GitHubAppPlaybookPrApi("test-installation-token",fetcher as unknown as typeof fetch);
  await expect(api.createPullRequest("other/repo","pbos/mission-smoke1","main","Smoke","Evidence")).rejects.toThrow("allowlisted");
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("rejects missing installation token",()=>expect(()=>new GitHubAppPlaybookPrApi("")).toThrow("token"));
});
