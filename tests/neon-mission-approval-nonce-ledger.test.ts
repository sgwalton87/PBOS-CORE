import { describe, expect, it, vi } from "vitest";
import { NeonMissionApprovalNonceLedger } from "../pbos/production-runtime/neon-mission-approval-nonce-ledger";
describe("durable hosted approval nonce", () => {
  it("uses parameterized atomic database consumption and exact mission lineage", async () => {
    const query=vi.fn(async () => ({rows:[{consumed:true}]}));
    const ledger=new NeonMissionApprovalNonceLedger({query});
    const nonce="12345678-1234-1234-1234-123456789abc";
    expect(await ledger.consume(nonce,"mission-1","sgwalton87/PBOS-CORE","2026-11-22T12:00:00Z")).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("consume_mission_approval_nonce"),
      [nonce,"mission-1","sgwalton87/PBOS-CORE","2026-11-22T12:00:00Z"]);
  });
  it("fails closed when nonce already consumed", async () => {
    const ledger=new NeonMissionApprovalNonceLedger({query:async () => ({rows:[{consumed:false}]})});
    expect(await ledger.consume("12345678-1234-1234-1234-123456789abc","mission-1","repo","2026-11-22T12:00:00Z")).toBe(false);
  });
});
