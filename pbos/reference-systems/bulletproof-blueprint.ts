import { SystemBlueprintFactory } from "../system-blueprint";

export const createBulletproofBlueprint = () => new SystemBlueprintFactory().create({
    organizationName: "Bulletproof", systemName: "Bulletproof Beneficiary", mission: "Help families discover, document, and protect beneficiary and legacy interests.",
    users: ["Members", "Beneficiaries", "Authorized representatives", "Verifiers"],
    desiredOutcomes: ["Verified identity", "Trackable beneficiary search", "Secure legacy policy records"],
    domain: "LEGACY_PLANNING", capabilities: ["IDENTITY", "WORKFLOWS", "DOCUMENTS", "EVIDENCE", "INTEGRATIONS"],
    applicationStrategy: "CONNECT_EXISTING", existingRepository: "vycoywalton/bulletproof-beneficiary-registry",
    autonomyMode: "HUMAN_GATED", businessOwner: "Viveca Walton", technicalOwner: "PBOS Genesis",
    operatingRegions: ["US"], dataClassifications: ["IDENTITY_DATA", "BENEFICIARY_DATA", "CONFIDENTIAL_DOCUMENTS"],
    regulatoryFrameworks: ["HUMAN_LEGAL_REVIEW_REQUIRED"],
    brand: { personalities: ["TRUSTWORTHY", "WARM", "PREMIUM"], visualDirection: "GUIDED_CUSTOM", theme: "BOTH", cornerStyle: "ROUNDED", density: "COMFORTABLE" }
});
