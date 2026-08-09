import { describe, expect, it } from "vitest";
import { assertPlaybookFullCanonicalRoadmap, PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS,
    PLAYBOOK_CANONICAL_OPERATING_SYSTEMS, PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS } from "../playbook-full-canonical-roadmap";

describe("Playbook full canonical roadmap", () => {
    it("preserves all 17 OS identities and 14+ role-specific onboarding pathways", () => {
        expect(() => assertPlaybookFullCanonicalRoadmap()).not.toThrow();
        expect(PLAYBOOK_CANONICAL_OPERATING_SYSTEMS).toHaveLength(17);
        expect(PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.length).toBeGreaterThanOrEqual(14);
        expect(new Set(PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.map(item => item.osId)).size).toBe(17);
        expect(new Set(PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.map(item => item.pathwayId)).size)
            .toBe(PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.length);
        expect(PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS).toHaveLength(32);
    });

    it("keeps provisioned Founder/Admin authority outside public onboarding", () => {
        const onboardingIds = PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.map(item => item.operatingSystemId);
        expect(onboardingIds).not.toContain("FOUNDER");
        expect(onboardingIds).not.toContain("PLATFORM_ADMIN");
    });
});
