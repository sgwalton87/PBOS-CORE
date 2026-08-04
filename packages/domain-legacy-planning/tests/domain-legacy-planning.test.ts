import { describe, expect, it } from "vitest";
import { LegacyPlanningRuntime } from "../src";

describe("legacy planning domain pack", () => {
    it("enforces search lifecycle and provenance", () => {
        const runtime = new LegacyPlanningRuntime();
        const draft = runtime.createSearch("member-1", "Jordan Beneficiary", "child", "identity-evidence");
        const submitted = runtime.transition(draft, "SUBMITTED", "member-1");
        expect(submitted.search.status).toBe("SUBMITTED");
        expect(() => runtime.transition(submitted.search, "IN_REVIEW", "operator")).toThrow("explicit approval");
        expect(runtime.transition(submitted.search, "IN_REVIEW", "operator", "approval-1").event.provenance).toContain("approval-1");
    });

    it("requires approval for verifier authority", () => {
        const runtime = new LegacyPlanningRuntime();
        expect(runtime.authorize("VERIFIER", "IDENTITY_VERIFICATION", "VERIFY")).toBe(false);
        expect(runtime.authorize("VERIFIER", "IDENTITY_VERIFICATION", "VERIFY", "approval-1")).toBe(true);
    });
});
