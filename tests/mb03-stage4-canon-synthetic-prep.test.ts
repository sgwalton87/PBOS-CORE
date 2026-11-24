import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparePinnedCanonSnapshot } from "../pbos/tools/mb03-stage4-prepare-canon";
import { prepareSyntheticOnlyState } from "../pbos/tools/mb03-stage4-prepare-synthetic";

const roots: string[] = [];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "mb03-stage4-unit-"));
  chmodSync(root, 0o700);
  roots.push(root);
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) {\n  const snapshot = join(root, "snapshot");\n  if (existsSync(snapshot)) chmodSync(snapshot, 0o700);\n  rmSync(root, { recursive: true, force: true });\n} });

describe("Stage 4 pinned Canon preparation", () => {
  it("copies the existing verified manifest and all referenced documents create-only", async () => {
    const root = workspace(), source = join(root, "pps"), output = join(root, "snapshot");
    mkdirSync(source, { mode: 0o700 });
    const documents = Array.from({ length: 16 }, (_, n) => {
      const id = `PPS-${String(n).padStart(3, "0")}`;
      const file = `${id}_TEST.md`;
      const contents = `# ${id}\n`;
      writeFileSync(join(source, file), contents);
      return { id, file, sha256: hash(contents), dependencies: [] };
    });
    const manifest = JSON.stringify({ documents }) + "\n";
    writeFileSync(join(source, "manifest.json"), manifest);
    const result = await preparePinnedCanonSnapshot(source, output, hash(manifest));
    expect(result.status).toBe("PINNED_CANON_SNAPSHOT_READY");
    expect(result.documentsVerified).toBe(16);
    expect(readFileSync(join(output, "manifest.json"), "utf8")).toBe(manifest);
    await expect(preparePinnedCanonSnapshot(source, output, hash(manifest))).rejects.toThrow();
  });
  it("fails closed on a mismatched document and never leaves a destination", async () => {
    const root = workspace(), source = join(root, "pps"), output = join(root, "snapshot");
    mkdirSync(source, { mode: 0o700 });
    writeFileSync(join(source, "manifest.json"), JSON.stringify({ documents: [
      { id: "PPS-000", file: "PPS-000_TEST.md", sha256: "f".repeat(64), dependencies: [] }
    ] }));
    writeFileSync(join(source, "PPS-000_TEST.md"), "unexpected contents");
    const pin = hash(readFileSync(join(source, "manifest.json"), "utf8"));
    await expect(preparePinnedCanonSnapshot(source, output, pin)).rejects.toThrow();
    expect(existsSync(output)).toBe(false);
  });
});

describe("Stage 4 private synthetic state", () => {
  it("creates a bound empty state, inspects it and refuses a duplicate create", () => {
    const root = workspace(), file = join(root, "synthetic.json"), scope = "mb03-synthetic-test";
    const result = prepareSyntheticOnlyState(file, scope, "STAGE4-SYNTHETIC-ONLY");
    expect(result.missionExecutionAuthorized).toBe(false);
    expect(result.originalGenesisUntouched).toBe(true);
    expect(prepareSyntheticOnlyState(file, scope, "STAGE4-SYNTHETIC-ONLY", "inspect").sha256).toBe(result.sha256);
    expect(() => prepareSyntheticOnlyState(file, scope, "STAGE4-SYNTHETIC-ONLY")).toThrow();
    expect(() => prepareSyntheticOnlyState(file, scope, "WRONG", "inspect")).toThrow();
  });
});
