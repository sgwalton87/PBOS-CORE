import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectProtectedFileBoundary, inspectMb03FileBoundaries } from "../mb03-file-boundary-preflight";

const roots: string[] = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), "mb03-boundary-"));
  roots.push(root);
  const file = join(root, "mission.json");
  writeFileSync(file, "synthetic");
  chmodSync(file, 0o600);
  return { root, file };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("MB-03 read-only protected file preflight", () => {
  it("accepts a regular private bounded file", () => {
    const { file } = setup();
    expect(inspectProtectedFileBoundary(file, 100)).toBeNull();
  });
  it("distinguishes absent, empty, oversized and exposed inputs", () => {
    const { file, root } = setup();
    expect(inspectProtectedFileBoundary(join(root, "missing"), 100)).toBe("MISSING");
    writeFileSync(file, "");
    expect(inspectProtectedFileBoundary(file, 100)).toBe("EMPTY");
    writeFileSync(file, "longer");
    expect(inspectProtectedFileBoundary(file, 3)).toBe("TOO_LARGE");
    chmodSync(file, 0o644);
    expect(inspectProtectedFileBoundary(file, 100)).toBe("EXPOSED");
  });
  it("rejects redirected and non-regular files", () => {
    const { root, file } = setup();
    const link = join(root, "alias");
    symlinkSync(file, link);
    expect(inspectProtectedFileBoundary(link, 100)).toBe("REDIRECTED");
    const dir = join(root, "dir");
    mkdirSync(dir);
    expect(inspectProtectedFileBoundary(dir, 100)).toBe("NOT_REGULAR");
  });
  it("reports only field identifiers and safe issue codes, no paths or contents", () => {
    const { file } = setup();
    const report = inspectMb03FileBoundaries({
      PBOS_APPROVAL_PUBLIC_KEY_FILE: file,
      PBOS_PROVIDER_PUBLIC_KEY_FILE: file,
      PBOS_PROVIDER_SIGNING_KEY_FILE: file,
      PBOS_MISSION_INPUT_FILE: file,
      PBOS_DISPOSABLE_STATE_FILE: "/unavailable/disposable.json"
    });
    expect(report.status).toBe("BLOCKED");
    expect(report.results.find(item => item.field === "PBOS_DISPOSABLE_STATE_FILE")?.status).toBe("MISSING");
    expect(JSON.stringify(report)).not.toContain(file);
    expect(JSON.stringify(report)).not.toContain("synthetic");
    expect(JSON.stringify(report)).not.toContain("/unavailable");
  });
});
