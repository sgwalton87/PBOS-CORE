import { SystemBlueprint, SystemBlueprintFactory } from "../system-blueprint";

export function createPlaybookBlueprint(): SystemBlueprint {
    const blueprint = new SystemBlueprintFactory().create({
        organizationName: "The Playbook",
        systemName: "The Playbook",
        mission: "Connect scholars to people, knowledge, guidance, and opportunities that move their goals forward.",
        users: ["Scholars", "Scholar-athletes", "Educators", "Mentors", "Coaches", "Families"],
        desiredOutcomes: ["Completed Scholar onboarding", "Authorized identity and goals dashboard", "Connected opportunity journey"],
        domain: "EDUCATION",
        capabilities: ["IDENTITY", "WORKFLOWS", "INTELLIGENCE", "ANALYTICS", "AUTOMATION", "NOTIFICATIONS", "INTEGRATIONS"],
        applicationStrategy: "CONNECT_EXISTING",
        existingRepository: "sgwalton87/playbook-platform",
        autonomyMode: "HUMAN_GATED",
        businessOwner: "Stephisha Walton",
        technicalOwner: "PBOS Genesis",
        operatingRegions: ["US"],
        dataClassifications: ["IDENTITY_DATA", "EDUCATION_DATA", "GOALS_AND_OPPORTUNITY_DATA"],
        regulatoryFrameworks: ["HUMAN_EDUCATION_SAFETY_REVIEW_REQUIRED"],
        brand: {
            personalities: ["BOLD", "WARM", "INNOVATIVE", "COMMUNITY_CENTERED"],
            visualDirection: "EXISTING_BRAND",
            primaryColor: "#8B4A1F",
            secondaryColor: "#F2E6D0",
            accentColor: "#D4AF37",
            theme: "BOTH",
            cornerStyle: "ROUNDED",
            density: "COMFORTABLE",
            tagline: "Connect. Empower. Achieve.",
            headingFont: "Montserrat, Inter, system-ui, sans-serif",
            bodyFont: "Inter, system-ui, sans-serif",
            usageGuidance: "Use The Playbook identity only inside The Playbook application. PBOS Genesis remains the factory brand.",
            assets: [{
                assetId: "THE-PLAYBOOK-MASTER-BOARD-002",
                kind: "LOGO_CARD",
                location: "assets/brand/playbook-platform/the-playbook-master-brand-board-v2.png",
                mediaType: "image/png",
                sha256: "f0903d2ad8a74f7551048734b14216947686896c2b8568383711e753c9af746b",
                rightsConfirmed: true
            }]
        }
    });
    return {
        ...blueprint,
        identity: {
            ...blueprint.identity,
            proposedSystemId: "PLAYBOOK-SYSTEM-001",
            proposedOperatingSystemId: "PLAYBOOK-OS-001"
        }
    };
}
