import { describe, expect, it } from "vitest";
import { EngineeringArchivist, isQualifyingMilestone } from "../index";

describe("PBOS Engineering Archivist", () => {
    it("creates deterministic milestone, snapshot, journal, validation, and lineage records", () => {
        const request = {
            systemId: "SYSTEM-001", systemName: "Example", repository: "example/application", revision: "abc123",
            message: "Milestone: complete governed identity", progress: { completion: 45 }, recordedAt: new Date("2026-08-05T08:00:00.000Z"),
            validation: [
                { command: "npm run typecheck", state: "PASSED" as const, reference: "check:typecheck:1" },
                { command: "npm test", state: "PASSED" as const, reference: "check:test:1" },
                { command: "npm run build", state: "PASSED" as const, reference: "check:build:1" }
            ]
        };
        const first = new EngineeringArchivist().archive(request);
        const second = new EngineeringArchivist().archive(request);
        expect(first).toEqual(second);
        expect(first.state).toBe("VERIFIED");
        expect(first.lineage).toContain("abc123");
        expect(first.files.map(file => file.path)).toEqual(expect.arrayContaining([
            "docs/project-management/snapshots/latest.md",
            "founders-journal/daily/2026-08-05.md"
        ]));
        expect(first.files[0].content).toContain("sha256:");
    });

    it("does not certify failed evidence or ordinary commits", () => {
        expect(isQualifyingMilestone("fix: ordinary change")).toBe(false);
        const archivist = new EngineeringArchivist();
        expect(() => archivist.archive({ systemId: "S", systemName: "S", repository: "o/r", revision: "1",
            message: "fix: ordinary change", progress: {}, recordedAt: new Date(),
            validation: [{ command: "npm test", state: "PASSED", reference: "test:1" }] })).toThrow("Milestone:");
        expect(archivist.archive({ systemId: "S", systemName: "S", repository: "o/r", revision: "1",
            message: "Milestone: attempted release", progress: {}, recordedAt: new Date("2026-08-05T08:00:00Z"),
            validation: [{ command: "npm test", state: "FAILED", reference: "test:failed" }] }).state).toBe("VALIDATION_FAILED");
    });
});
