import { describe,it,expect,vi } from "vitest";
import type { NeonLeaseSql } from "../pbos/production-runtime/neon-fenced-lease-provider";
import { NeonFencedMissionCheckpoint } from "../pbos/production-runtime/neon-fenced-mission-checkpoint";

describe("MB03 durable fenced checkpoint", () => {
 const lease={resource:"pbos:mission:owner/repo:mission-1",ownerId:"12345678-1234-1234-1234-123456789abc",fencingToken:8n};
 it("commits encrypted bytes with exact lease and expected version",async()=>{
   const query=vi.fn(async()=>({rows:[{version:"2"}]}));
   const adapter=new NeonFencedMissionCheckpoint({query:query as unknown as NeonLeaseSql["query"]});
   expect(await adapter.commit(lease,"mission-1","owner/repo",1n,new Uint8Array([1,2,3]))).toBe(2n);
   expect(query).toHaveBeenCalledWith(expect.stringContaining("commit_mission_checkpoint"),
     ["mission-1","owner/repo",lease.resource,lease.ownerId,"8","1","010203"]);
 });
 it("rejects mismatched mission or empty ciphertext before SQL",async()=>{
   const query=vi.fn();
   const adapter=new NeonFencedMissionCheckpoint({query:query as unknown as NeonLeaseSql["query"]});
   await expect(adapter.commit(lease,"other","owner/repo",0n,new Uint8Array([1]))).rejects.toThrow("lineage");
   await expect(adapter.commit(lease,"mission-1","owner/repo",0n,new Uint8Array())).rejects.toThrow("ciphertext");
   expect(query).not.toHaveBeenCalled();
 });
});
