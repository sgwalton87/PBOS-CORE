import { describe, expect, it } from "vitest";
import { assertPlaybookFullCanonicalRoadmap, PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS,
    PLAYBOOK_CANONICAL_OPERATING_SYSTEMS, PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS,
    playbookCanonChecklistItemMissionId } from "../playbook-full-canonical-roadmap";

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

    it("derives stable item-sized phase mission identities", () => {
        expect(playbookCanonChecklistItemMissionId("PHASE-01", "Google Login"))
            .toBe("048-phase-01-item-google-login");
        expect(playbookCanonChecklistItemMissionId("PHASE-15", "Soft launch", 2))
            .toBe("048-phase-15-item-soft-launch-occurrence-2");
    });
});
