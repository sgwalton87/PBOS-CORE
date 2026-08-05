import { describe, expect, it } from "vitest";
import { BULLETPROOF_BENEFICIARY_BRAND, BULLETPROOF_BENEFICIARY_ICON_SUITE,
    PBOS_GENESIS_BRAND, PBOS_GENESIS_PORTAL_CANON, PLAYBOOK_PLATFORM_BRAND } from "../index";

describe("PBOS Genesis brand contract", () => {
    it("registers the supplied master board and canonical identity", () => {
        expect(PBOS_GENESIS_BRAND.product).toBe("PBOS Genesis");
        expect(PBOS_GENESIS_BRAND.tagline).toBe("Create. Power. Evolve.");
        expect(PBOS_GENESIS_BRAND.asset).toMatchObject({ width: 1536, height: 1024, format: "PNG" });
        expect(PBOS_GENESIS_BRAND.colors.map(color => color.name)).toContain("Genesis Copper");
    });

    it("keeps the Playbook application identity separate", () => {
        expect(PBOS_GENESIS_BRAND.usageRules).toContain("Do not use the Genesis mark as The Playbook app icon.");
        expect(PLAYBOOK_PLATFORM_BRAND.product).toBe("The Playbook");
        expect(PLAYBOOK_PLATFORM_BRAND.asset.sourcePath).toContain("the-playbook-master-brand-board-v2.png");
        expect(PLAYBOOK_PLATFORM_BRAND.tagline).toBe("Connect. Empower. Achieve.");
        expect(PLAYBOOK_PLATFORM_BRAND.colors.map(color => color.value)).toEqual([
            "#0D0D0F", "#F2E6D0", "#8B4A1F", "#D4AF37", "#C8B089"
        ]);
        expect(PLAYBOOK_PLATFORM_BRAND.brandId).not.toBe(PBOS_GENESIS_BRAND.brandId);
    });

    it("keeps the Bulletproof registry identity and icon language independent", () => {
        expect(BULLETPROOF_BENEFICIARY_BRAND.colors.map(color => color.value)).toEqual([
            "#D4AF37", "#F2E3C2", "#0D0D0F", "#1B1B1E", "#74856B"
        ]);
        expect(BULLETPROOF_BENEFICIARY_ICON_SUITE).toContain("LEGACY_PLANNING");
        expect(BULLETPROOF_BENEFICIARY_ICON_SUITE).toContain("COMPLIANCE_AUDIT");
        expect(BULLETPROOF_BENEFICIARY_BRAND.brandId).not.toBe(PLAYBOOK_PLATFORM_BRAND.brandId);
        expect(BULLETPROOF_BENEFICIARY_BRAND.asset.sourcePath).toContain("master-brand-board-v3.png");
        expect(BULLETPROOF_BENEFICIARY_BRAND.usageRules).toContain("Do not use the name Bulletproof Group in this product identity.");
    });

    it("assigns a distinct canonical logo to every portal product", () => {
        const assignments = Object.values(PBOS_GENESIS_PORTAL_CANON.logoAssignments);
        expect(new Set(assignments.map(assignment => assignment.brandId)).size).toBe(3);
        expect(PBOS_GENESIS_PORTAL_CANON.logoAssignments.factory.brandId).toBe(PBOS_GENESIS_BRAND.brandId);
        expect(PBOS_GENESIS_PORTAL_CANON.logoAssignments.playbookApplication.brandId).toBe(PLAYBOOK_PLATFORM_BRAND.brandId);
        expect(PBOS_GENESIS_PORTAL_CANON.logoAssignments.bulletproofApplication.brandId).toBe(BULLETPROOF_BENEFICIARY_BRAND.brandId);
        expect(PBOS_GENESIS_PORTAL_CANON.renderings).toHaveLength(5);
        expect(PBOS_GENESIS_PORTAL_CANON.renderings.every(path => path.endsWith("-v3.png"))).toBe(true);
        expect(PBOS_GENESIS_PORTAL_CANON.logoAssignments.playbookApplication.product).toBe("The Playbook");
    });
});
