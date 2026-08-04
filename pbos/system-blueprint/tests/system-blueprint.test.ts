import { describe, expect, it } from "vitest";
import { DesignSystemGenerator, SystemBlueprintFactory, SystemIntakeSubmission } from "../index";

const educationIntake: SystemIntakeSubmission = {
    organizationName: "Example Learning",
    systemName: "Scholar Opportunity Network",
    mission: "Improve scholar opportunity readiness.",
    users: ["Scholars", "Families", "Mentors"],
    desiredOutcomes: ["Verified scholar records", "Opportunity readiness"],
    domain: "EDUCATION",
    capabilities: ["IDENTITY", "WORKFLOWS", "ANALYTICS", "AUTOMATION"],
    applicationStrategy: "CREATE_NEW",
    autonomyMode: "DELEGATED_AUTONOMY",
    businessOwner: "business-owner",
    technicalOwner: "technical-owner",
    operatingRegions: ["US-CA"],
    dataClassifications: ["STUDENT_DATA"],
    regulatoryFrameworks: ["FERPA"],
    brand: {
        personalities: ["YOUTHFUL", "TRUSTWORTHY"],
        visualDirection: "PBOS_RECOMMENDED",
        theme: "BOTH",
        cornerStyle: "ROUNDED",
        density: "COMFORTABLE"
    }
};

describe("PBOS system blueprint intake", () => {
    it("produces an approval-ready blueprint from minimum accountable intake", () => {
        const blueprint = new SystemBlueprintFactory().create(educationIntake);
        expect(blueprint.status).toBe("READY_FOR_APPROVAL");
        expect(blueprint.foundation.domainPack).toBe("@pbos/domain-education");
        expect(blueprint.identity.proposedSystemId).toBe("SCHOLAR-OPPORTUNITY-NETWORK-SYSTEM-001");
        expect(blueprint.governance.protectedActions).toContain("DEPLOY_PRODUCTION");
    });

    it("keeps the PBOS foundation stable while domain packs differ", () => {
        const education = new SystemBlueprintFactory().create(educationIntake);
        const legacy = new SystemBlueprintFactory().create({
            ...educationIntake,
            systemName: "Family Legacy Network",
            domain: "LEGACY_PLANNING",
            dataClassifications: ["BENEFICIARY_DATA"],
            regulatoryFrameworks: []
        });
        expect(education.foundation.pbosVersion).toBe(legacy.foundation.pbosVersion);
        expect(education.foundation.domainPack).not.toBe(legacy.foundation.domainPack);
        expect(education.design.tokens.colors.primary).not.toBe(legacy.design.tokens.colors.primary);
    });

    it("requires human regulatory classification for regulated domains", () => {
        const blueprint = new SystemBlueprintFactory().create({
            ...educationIntake,
            systemName: "Care Coordination",
            domain: "HEALTHCARE",
            regulatoryFrameworks: []
        });
        expect(blueprint.status).toBe("REVIEW_REQUIRED");
        expect(blueprint.unresolvedDecisions[0]).toContain("Regulatory frameworks");
    });

    it("requires repository identity when connecting an existing application", () => {
        expect(() => new SystemBlueprintFactory().create({
            ...educationIntake,
            applicationStrategy: "CONNECT_EXISTING",
            existingRepository: undefined
        })).toThrow("requires a repository");
    });

    it("remediates custom primary colors to accessible interactive tokens", () => {
        const result = new DesignSystemGenerator().generate("COMMUNITY", {
            ...educationIntake.brand,
            visualDirection: "GUIDED_CUSTOM",
            primaryColor: "#76A9FF"
        });
        expect(result.tokens.colors.primary).not.toBe("#76A9FF");
        expect(result.accessibility.normalTextPass).toBe(true);
    });

    it("preserves governed logo-card inputs and explicit typography for downstream builds", () => {
        const blueprint = new SystemBlueprintFactory().create({ ...educationIntake, brand: {
            ...educationIntake.brand,
            tagline: "Connect. Empower. Achieve.",
            headingFont: "Montserrat",
            bodyFont: "Inter",
            assets: [{ assetId: "PLAYBOOK-LOGO-CARD-001", kind: "LOGO_CARD",
                location: "uploads/playbook-logo-card.png", sha256: "a".repeat(64), rightsConfirmed: true }]
        } });
        expect(blueprint.design.brand.assets?.[0].location).toBe("uploads/playbook-logo-card.png");
        expect(blueprint.design.tokens.typography).toEqual({ heading: "Montserrat", body: "Inter" });
        expect(blueprint.status).toBe("READY_FOR_APPROVAL");
    });

    it("requires human review when brand usage rights are not confirmed", () => {
        const blueprint = new SystemBlueprintFactory().create({ ...educationIntake, brand: {
            ...educationIntake.brand,
            assets: [{ assetId: "LOGO-001", kind: "PRIMARY_LOGO", location: "uploads/logo.svg", rightsConfirmed: false }]
        } });
        expect(blueprint.status).toBe("REVIEW_REQUIRED");
        expect(blueprint.unresolvedDecisions).toContain("Brand asset ownership or usage rights require human confirmation.");
    });
});
