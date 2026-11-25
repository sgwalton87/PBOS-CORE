import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GcsHostedEvidence } from "../gcs-hosted-evidence";
import { evidenceDigest } from "../remote-attestation";
import { verifyEvidenceMount } from "../../tools/mb03-protected-playbook-codex";

describe("hosted evidence publication", () => {
    let directory: string;
    beforeEach(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), "mb03-evidence-"))); });
    afterEach(() => { rmSync(directory, { recursive: true }); });

    function archive(status: number, mounted: "exact" | "corrupt" | "absent") {
        const http = vi.fn<typeof fetch>(async (url, init) => {
            const endpoint = new URL(String(url));
            const bytes = String(init?.body);
            const digest = evidenceDigest(bytes);
            expect(endpoint.origin + endpoint.pathname).toBe("https://storage.googleapis.com/upload/storage/v1/b/pbos-genesis-staging-mb03-execution-state/o");
            expect(endpoint.searchParams.get("ifGenerationMatch")).toBe("0");
            expect(endpoint.searchParams.get("name")).toBe("synthetic/evidence/" + digest);
            expect(init?.method).toBe("POST");
            expect(init?.redirect).toBe("error");
            if (mounted !== "absent") writeFileSync(join(directory, digest), mounted === "exact" ? bytes : "{}", { mode: 0o600 });
            return new Response(null, { status });
        });
        return { writer: new GcsHostedEvidence(directory, async () => "fixture", http), http };
    }
    it.each([200, 412])("requires exact mounted bytes after status %i", async status => {
        const { writer, http } = archive(status, "exact");
        expect(await writer.preserve({ fixture: true })).toMatch(/^[a-f0-9]{64}$/);
        expect(http).toHaveBeenCalledTimes(1);
    });
    it.each([200, 412])("rejects mismatched bytes after status %i", async status => {
        await expect(archive(status, "corrupt").writer.preserve({})).rejects.toThrow(/digest mismatch/);
    });
    it("rejects a wrong or unpopulated mount", async () => {
        await expect(archive(200, "absent").writer.preserve({})).rejects.toThrow(/ENOENT/);
    });
    it("rejects denied write even with a readable artifact", async () => {
        await expect(archive(403, "exact").writer.preserve({})).rejects.toThrow(/refused/);
    });
    it("rejects oversized evidence before requesting a token", async () => {
        const token = vi.fn();
        await expect(new GcsHostedEvidence(directory, token).preserve("a".repeat(8 * 1024 * 1024))).rejects.toThrow(/size/);
        expect(token).not.toHaveBeenCalled();
    });
    it("refuses the probe with mission execution enabled", async () => {
        await expect(verifyEvidenceMount({ PBOS_MISSION_EXECUTION_APPROVED: "true" })).rejects.toThrow(/disabled/);
    });
});
