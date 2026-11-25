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
 it("reads only the bounded mission file and validates its base64 encoding",async()=>{
  const content="exact signed content";
  const fetcher=vi.fn(async(_url:string,_options?:RequestInit)=>new Response(JSON.stringify({encoding:"base64",content:Buffer.from(content).toString("base64")}),{status:200}));
  const api=new GitHubAppPlaybookPrApi("test-installation-token",fetcher as unknown as typeof fetch);
  await expect(api.getFileContent("sgwalton87/playbook-platform","pbos/mission-smoke1","docs/pbos-missions/smoke1.md")).resolves.toBe(content);
  expect(fetcher.mock.calls[0][0]).toContain("/contents/docs/pbos-missions/smoke1.md?ref=pbos%2Fmission-smoke1");
 });
 it("rejects missing installation token",()=>expect(()=>new GitHubAppPlaybookPrApi("")).toThrow("token"));
});

describe("Mission 001 tracked-document safeguards", () => {
  const missionId = "MB03-MISSION-001";
  const input = {
    repository: "sgwalton87/playbook-platform" as const, baseSha: "a".repeat(40),
    branch: "pbos/mission-" + missionId, path: "docs/pbos-missions/" + missionId + ".md",
    missionId, content: "reviewed bytes", title: "Fixture", body: "Test"
  };
  const head = "b".repeat(40);
  const blob = "c".repeat(40);
  const entry = {path: input.path, type: "blob", mode: "100644", sha: blob};

  it.each([
    {truncated: true, tree: [entry]},
    {truncated: false, tree: [{...entry, mode: "120000"}]},
    {truncated: false, tree: []}
  ])("requires a regular file in a complete tree", async tree => {
    const api = new GitHubAppPlaybookPrApi("fixture", async () => Response.json(tree));
    await expect(api.getTrackedFileBlob(input.repository, head, input.path)).rejects.toThrow();
  });

  it("rejects a moved branch even when GitHub returns HTTP success", async () => {
    const transport = vi.fn(async () => Response.json({errors: [{type: "STALE_DATA"}]}));
    const api = new GitHubAppPlaybookPrApi("fixture", transport);
    await expect(api.updateTrackedFile(input)).rejects.toThrow("conditional tracked-file commit");
    expect(transport).toHaveBeenCalledOnce();
  });

  it("rejects unrelated changes on a head with the correct target bytes", async () => {
    const api = new GitHubAppPlaybookPrApi("fixture", async url =>
      Response.json(String(url).includes("/git/trees/") ? {truncated: false, tree: [entry]} :
        {sha: head, parents: [{sha: input.baseSha}], files: [
          {filename: input.path, status: "modified", sha: blob},
          {filename: "unreviewed", status: "added", sha: "d".repeat(40)}
        ]}));
    await expect(api.assertSingleTrackedEdit(input, head, blob)).rejects.toThrow("only the approved edit");
  });

  it.each([{state: "open", draft: false}, {state: "closed", draft: true}])(
    "refuses to replace a mission PR in state $state with draft=$draft", async status => {
      const repo = {full_name: input.repository};
      const api = new GitHubAppPlaybookPrApi("fixture", async url => {
        expect(new URL(String(url)).searchParams.get("state")).toBe("all");
        return Response.json([{
          html_url: "https://github.com/" + input.repository + "/pull/1", number: 1, ...status,
          head: {ref: input.branch, sha: head, repo}, base: {ref: "main", sha: input.baseSha, repo}
        }]);
      });
      await expect(api.findPullRequest(input.repository, input.branch, "main")).rejects.toThrow("draft PR lineage");
    });
});
