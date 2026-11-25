import { describe,it,expect,vi } from "vitest";
import { createFencedPlaybookPr, type FencedPrInput } from "../pbos/production-runtime/fenced-playbook-pr-executor";
const lease={resource:"pbos:mission:sgwalton87/playbook-platform:smoke1",ownerId:"12345678-1234-1234-1234-123456789abc",fencingToken:2n};
const input:FencedPrInput={repository:"sgwalton87/playbook-platform",baseSha:"a".repeat(40),missionId:"smoke1",branch:"pbos/mission-smoke1",path:"docs/pbos-missions/smoke1.md",content:"Bounded mission evidence",title:"PBOS bounded mission smoke1",body:"Non-production test mission"};
function setup() {
 const api={
   getBranchSha:vi.fn(async (_repo:string,branch:string)=>{if(branch==="main")return input.baseSha;throw new Error("GITHUB_BRANCH_NOT_FOUND");}),
   getFileContent:vi.fn(async()=>input.content),
   createBranch:vi.fn(async()=>{}),
   getTrackedFileBlob:vi.fn(),
   assertSingleTrackedEdit:vi.fn(),
   updateTrackedFile:vi.fn(),
   createFile:vi.fn(async()=>{}),
   createPullRequest:vi.fn(async()=>({url:"https://github.com/sgwalton87/playbook-platform/pull/123",number:123})),
   findPullRequest:vi.fn(async():Promise<{url:string;number:number}|null>=>null)
 };
 return api;
}
describe("bounded Playbook PR executor",()=>{
 it("creates one isolated branch, one file and one PR with fence checks",async()=>{
   const api=setup(),fence=vi.fn(async()=>true);
   const result=await createFencedPlaybookPr(api,lease,fence,input);
   expect(result.number).toBe(123);
   expect(api.createBranch).toHaveBeenCalledOnce();
   expect(api.createFile).toHaveBeenCalledOnce();
   expect(api.createPullRequest).toHaveBeenCalledOnce();
   expect(fence.mock.calls.length).toBeGreaterThanOrEqual(5);
 });
 it("rejects a stale lease before any mutation",async()=>{
   const api=setup();
   await expect(createFencedPlaybookPr(api,lease,async()=>false,input)).rejects.toThrow("lease lost");
   expect(api.createBranch).not.toHaveBeenCalled();
 });
 it("rejects an advanced main and never creates a branch",async()=>{
   const api=setup();api.getBranchSha.mockImplementation(async()=> "b".repeat(40));
   await expect(createFencedPlaybookPr(api,lease,async()=>true,input)).rejects.toThrow("advanced");
   expect(api.createBranch).not.toHaveBeenCalled();
 });
 it("rejects arbitrary path and repository",async()=>{
   const api=setup();
   await expect(createFencedPlaybookPr(api,lease,async()=>true,{...input,path:"src/auth.ts"})).rejects.toThrow("invalid");
   expect(api.createBranch).not.toHaveBeenCalled();
 });
 it("reuses an existing matching PR without duplicate writes",async()=>{
   const api=setup();api.findPullRequest.mockImplementation(async()=>({url:"https://github.com/sgwalton87/playbook-platform/pull/123",number:123}));
   await createFencedPlaybookPr(api,lease,async()=>true,input);
   expect(api.createBranch).not.toHaveBeenCalled();
   expect(api.createFile).not.toHaveBeenCalled();
 });
 it("rejects an existing PR whose file differs from the signed content",async()=>{
   const api=setup();api.findPullRequest.mockImplementation(async()=>({url:"https://github.com/sgwalton87/playbook-platform/pull/123",number:123}));
   api.getFileContent.mockImplementation(async()=>"stale content");
   await expect(createFencedPlaybookPr(api,lease,async()=>true,input)).rejects.toThrow("differs");
   expect(api.createBranch).not.toHaveBeenCalled();
 });
});
