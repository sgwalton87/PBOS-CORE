import { describe, expect, it } from "vitest";
import { governedBuildReference } from "../governed-repository-base";

describe("governed stacked repository builds", () => {
    const repository = { owner: "example", name: "application", defaultBranch: "main" };

    it("keeps an independent build on the canonical default branch", () => {
        expect(governedBuildReference(repository, "main")).toEqual(repository);
        expect(governedBuildReference(repository)).toEqual(repository);
    });

    it("uses an exact governed agent branch as the dependent mission base", () => {
        expect(governedBuildReference(repository, "agent/pbos-system-001-academic").defaultBranch)
            .toBe("agent/pbos-system-001-academic");
    });

    it("rejects arbitrary, traversal, and malformed stacked bases", () => {
        expect(() => governedBuildReference(repository, "feature/unapproved")).toThrow("governed agent/* branch");
        expect(() => governedBuildReference(repository, "agent/../main")).toThrow("governed agent/* branch");
        expect(() => governedBuildReference(repository, "agent/incomplete/")).toThrow("governed agent/* branch");
    });
});
