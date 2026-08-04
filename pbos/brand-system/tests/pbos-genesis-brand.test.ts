import { describe, expect, it } from "vitest";
import { BULLETPROOF_BENEFICIARY_BRAND, BULLETPROOF_BENEFICIARY_ICON_SUITE,
    PBOS_GENESIS_BRAND, PLAYBOOK_PLATFORM_BRAND } from "../index";

describe("PBOS Genesis brand contract", () => {
    it("registers the supplied master board and canonical identity", () => {
        expect(PBOS_GENESIS_BRAND.product).toBe("PBOS Genesis");
        expect(PBOS_GENESIS_BRAND.tagline).toBe("Create. Power. Evolve.");
        expect(PBOS_GENESIS_BRAND.asset).toMatchObject({ width: 1536, height: 1024, format: "PNG" });
        expect(PBOS_GENESIS_BRAND.colors.map(color => color.name)).toContain("Genesis Copper");
    });

    it("keeps the Playbook application identity separate", () => {
        expect(PBOS_GENESIS_BRAND.usageRules).toContain("Do not use the Genesis mark as the Playbook Platform app icon.");
        expect(PLAYBOOK_PLATFORM_BRAND.product).toBe("Playbook Platform");
        expect(PLAYBOOK_PLATFORM_BRAND.tagline).toBe("Connect. Empower. Achieve.");
        expect(PLAYBOOK_PLATFORM_BRAND.colors.map(color => color.value)).toEqual([
            "#0D0D0F", "#F2E6D0", "#8B4A1F", "#D4AF37", "#C8B089"
        ]);
        expect(PLAYBOOK_PLATFORM_BRAND.brandId).not.toBe(PBOS_GENESIS_BRAND.brandId);
    });

    it("keeps the Bulletproof registry identity and icon language independent", () => {
        expect(BULLETPROOF_BENEFICIARY_BRAND.colors.map(color => color.value)).toEqual([
            "#D4AF37", "#F2E3C2", "#0D0D0F", "#1B1B1E", "#1E5631"
        ]);
        expect(BULLETPROOF_BENEFICIARY_ICON_SUITE).toContain("LEGACY_PLANNING");
        expect(BULLETPROOF_BENEFICIARY_ICON_SUITE).toContain("COMPLIANCE_AUDIT");
        expect(BULLETPROOF_BENEFICIARY_BRAND.brandId).not.toBe(PLAYBOOK_PLATFORM_BRAND.brandId);
    });
});
