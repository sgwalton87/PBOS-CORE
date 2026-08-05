import { describe, expect, it } from "vitest";
import { SystemBlueprintFactory } from "../../system-blueprint";
import { GenesisBuildPlanCompiler } from "../index";

const blueprint = new SystemBlueprintFactory().create({
    organizationName: "Bulletproof", systemName: "Bulletproof Beneficiary", mission: "Protect family legacy.",
    users: ["Members", "Beneficiaries"], desiredOutcomes: ["Find policies"], domain: "LEGACY_PLANNING",
    capabilities: ["IDENTITY", "WORKFLOWS", "DOCUMENTS"], applicationStrategy: "CONNECT_EXISTING",
    existingRepository: "vycoywalton/bulletproof-beneficiary-registry", autonomyMode: "HUMAN_GATED",
    businessOwner: "Viveca", technicalOwner: "PBOS", operatingRegions: ["US"],
    dataClassifications: ["BENEFICIARY_DATA"], regulatoryFrameworks: ["HUMAN_REVIEW"],
    brand: { personalities: ["TRUSTWORTHY", "WARM"], visualDirection: "GUIDED_CUSTOM", theme: "BOTH", cornerStyle: "ROUNDED", density: "COMFORTABLE",
        assets: [{ assetId: "BRAND-CARD-001", kind: "LOGO_CARD", location: "uploads/brand-card.png", rightsConfirmed: true }] }
});

describe("Genesis build plan compiler", () => {
    it("compiles repository evidence into prioritized, testable work packages", async () => {
        const plan = await new GenesisBuildPlanCompiler().compile(blueprint, {
            repository: { owner: "vycoywalton", name: "bulletproof-beneficiary-registry", defaultBranch: "main" },
            revision: "abc123", findings: ["CAPABILITY:IDENTITY:PRESENT", "TRACKED_FILES:40"], inspectedAt: new Date()
        });
        expect(plan.gaps.map(gap => gap.capability)).toEqual(["WORKFLOWS", "DOCUMENTS"]);
        expect(plan.workPackages.map(item => item.id)).toEqual([
            `${blueprint.identity.proposedSystemId}:WORKFLOWS`, `${blueprint.identity.proposedSystemId}:DOCUMENTS`
        ]);
        expect(plan.workPackages.every(item => item.acceptanceCriteria.length >= 3)).toBe(true);
        expect(plan.implementationPlan).toHaveLength(2);
        expect(plan.missions[0].generatedFrom).toContain("BRAND_ASSET:BRAND-CARD-001:uploads/brand-card.png");
        expect(plan.status).toBe("READY_FOR_APPROVAL");
    });

    it("removes certified repository capabilities from every subsequent plan", async () => {
        const findings = blueprint.capabilities.map(capability => `CAPABILITY:${capability}:PRESENT`);
        const plan = await new GenesisBuildPlanCompiler().compile(blueprint, {
            repository: { owner: "vycoywalton", name: "bulletproof-beneficiary-registry", defaultBranch: "main" },
            revision: "certified", findings, inspectedAt: new Date()
        });
        expect(plan.gaps).toEqual([]);
        expect(plan.workPackages).toEqual([]);
    });
});
