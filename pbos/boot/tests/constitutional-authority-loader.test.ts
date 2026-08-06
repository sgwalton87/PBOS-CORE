import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { describe, expect, it } from "vitest";
import { ConstitutionalAuthorityLoader } from "../constitutional-authority-loader";

function fixture(): string {
    const root = mkdtempSync(join(tmpdir(), "pbos-constitution-"));
    const write = (path: string, content: string) => {
        const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content);
    };
    mkdirSync(join(root, "pbos")); mkdirSync(join(root, "packages"));
    mkdirSync(join(root, "docs", "organization-genome"), { recursive: true });
    mkdirSync(join(root, "docs", "architecture"), { recursive: true });
    EXPECTED.forEach(id => write(id === "PPS-006"
        ? "docs/PPS-006-PBOS-Constitutional-Execution-Modes.md" : `docs/${id}.md`, `---\nid: ${id}\n---\n`));
    mkdirSync(join(root, "pbos", "constitution", "PBS-5000-autonomous-software-production-runtime"), { recursive: true });
    mkdirSync(join(root, "pbos", "constitution", "PBS-6000-distributed-platform-architecture"), { recursive: true });
    write("pbos/constitution/PBS-5000-autonomous-software-production-runtime/000.md", "---\nid: PBS-5000-000\n---\n");
    write("pbos/constitution/PBS-6000-distributed-platform-architecture/6000.md", "---\nid: PBS-6000-000\n---\n");
    write("pbos/constitution/PBS-6000-distributed-platform-architecture/GRAPH.yaml", "nodes:\n  PRODUCT: {}\n");
    return root;
}

const EXPECTED = Array.from({ length: 16 }, (_value, index) => `PPS-${String(index).padStart(3, "0")}`);

describe("constitutional authority loader", () => {
    it("fails closed when inherited authorities are absent or a document has duplicate identity", async () => {
        const root = fixture();
        writeFileSync(join(root, "docs", "PPS-006-PBOS-Constitutional-Execution-Modes.md"),
            "---\nid: PPS-006\n---\n---\nid: PPS-006\n---\n");
        const report = await new ConstitutionalAuthorityLoader(root).inspect();
        expect(report.state).toBe("BLOCKED");
        expect(report.blockers).toEqual(expect.arrayContaining([expect.stringContaining("AMBIGUOUS_AUTHORITY")]));
        await expect(new ConstitutionalAuthorityLoader(root).assertReady()).rejects.toThrow("Constitutional boot blocked");
    });

    it("resolves one identity per authority and one executable graph", async () => {
        const root = fixture();
        const report = await new ConstitutionalAuthorityLoader(root).inspect();
        expect(report.state).toBe("READY");
        expect(report.blockers).toEqual([]);
    });
});
