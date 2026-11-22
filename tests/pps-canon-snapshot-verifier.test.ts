import { describe,it,expect } from "vitest";
import { mkdtemp,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { verifyPpsCanon } from "../pbos/boot/pps-canon-snapshot-verifier";

describe("GitHub PPS canonical snapshot verification", () => {
  it("fails closed on missing manifest", async () => {
    const root=await mkdtemp(join(tmpdir(),"pps-canon-"));
    try { expect((await verifyPpsCanon(root)).valid).toBe(false); }
    finally { await rm(root,{recursive:true,force:true}); }
  });
  it("checks actual bytes against manifest and requires core PPS IDs", async () => {
    const root=await mkdtemp(join(tmpdir(),"pps-canon-"));
    try {
      const bytes="constitutional source\n";
      await writeFile(join(root,"PPS-000_PLATFORM_OVERVIEW.md"),bytes);
      const sha256=createHash("sha256").update(bytes).digest("hex");
      const documents=[{id:"PPS-000",file:"PPS-000_PLATFORM_OVERVIEW.md",sha256,dependencies:[]}];
      await writeFile(join(root,"manifest.json"),JSON.stringify({documents}));
      const first=await verifyPpsCanon(root);
      expect(first.verifiedDocuments).toBe(1);
      expect(first.valid).toBe(false);
      expect(first.errors).toContain("PPS_CORE_MISSING:1");
      expect(await verifyPpsCanon(root, "a".repeat(64))).toMatchObject({
        valid: false, verifiedDocuments: 0, errors: ["PPS_MANIFEST_PIN_MISMATCH"]
      });
      const pin = createHash("sha256").update(JSON.stringify({documents})).digest("hex");
      expect(await verifyPpsCanon(root, pin)).toEqual(first);
      await writeFile(join(root,"PPS-000_PLATFORM_OVERVIEW.md"),"tampered");
      expect((await verifyPpsCanon(root)).errors).toContain("PPS_HASH_MISMATCH:PPS-000");
    } finally { await rm(root,{recursive:true,force:true}); }
  });
});
