import { randomUUID } from "crypto";
import { PROTECTED_BUILD_ACTIONS } from "../autonomous-authority";
import { DesignSystemGenerator } from "./design-system-generator";
import { DomainKind, SystemBlueprint, SystemIntakeSubmission } from "./contracts";

const DOMAIN_PACKS: Readonly<Record<DomainKind, string>> = {
    EDUCATION: "@pbos/domain-education",
    HEALTHCARE: "@pbos/domain-healthcare",
    FINANCE: "@pbos/domain-finance",
    GOVERNMENT: "@pbos/domain-government",
    LEGACY_PLANNING: "@pbos/domain-legacy-planning",
    WORKFORCE: "@pbos/domain-workforce",
    COMMUNITY: "@pbos/domain-community",
    CUSTOM: "@pbos/domain-custom"
};

const REGULATED_DOMAINS = new Set<DomainKind>(["HEALTHCARE", "FINANCE", "GOVERNMENT"]);

export class SystemBlueprintFactory {
    constructor(private readonly designs = new DesignSystemGenerator()) {}

    create(submission: SystemIntakeSubmission): SystemBlueprint {
        this.validate(submission);
        const generatedDesign = this.designs.generate(submission.domain, submission.brand);
        const unresolvedDecisions: string[] = [];
        if (REGULATED_DOMAINS.has(submission.domain) && submission.regulatoryFrameworks.length === 0) {
            unresolvedDecisions.push("Regulatory frameworks require human classification before generation.");
        }
        if (!generatedDesign.accessibility.passed) {
            unresolvedDecisions.push("Design accessibility remediation requires approval.");
        }
        const slug = submission.systemName.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
        return {
            blueprintId: randomUUID(),
            schemaVersion: "1.0.0",
            status: unresolvedDecisions.length === 0 ? "READY_FOR_APPROVAL" : "REVIEW_REQUIRED",
            identity: {
                organizationName: submission.organizationName,
                systemName: submission.systemName,
                proposedSystemId: `${slug}-SYSTEM-001`,
                proposedOperatingSystemId: `${slug}-OS-001`
            },
            mission: submission.mission,
            users: [...submission.users],
            desiredOutcomes: [...submission.desiredOutcomes],
            foundation: { pbosVersion: "1.0.0", domainPack: DOMAIN_PACKS[submission.domain], domainPackVersion: "1.0.0" },
            capabilities: [...new Set(submission.capabilities)],
            application: { strategy: submission.applicationStrategy, existingRepository: submission.existingRepository },
            governance: {
                autonomyMode: submission.autonomyMode,
                businessOwner: submission.businessOwner,
                technicalOwner: submission.technicalOwner,
                protectedActions: [...PROTECTED_BUILD_ACTIONS]
            },
            dataPolicy: {
                operatingRegions: [...submission.operatingRegions],
                classifications: [...submission.dataClassifications],
                regulatoryFrameworks: [...submission.regulatoryFrameworks]
            },
            design: { brand: submission.brand, ...generatedDesign },
            unresolvedDecisions,
            createdAt: new Date()
        };
    }

    private validate(submission: SystemIntakeSubmission): void {
        const required = [
            submission.organizationName, submission.systemName, submission.mission,
            submission.businessOwner, submission.technicalOwner
        ];
        if (required.some(value => !value.trim())) throw new Error("System intake requires identity, mission, and accountable owners.");
        if (submission.users.length === 0 || submission.desiredOutcomes.length === 0) {
            throw new Error("System intake requires users and desired outcomes.");
        }
        if (submission.capabilities.length === 0) throw new Error("System intake requires at least one capability.");
        if (submission.applicationStrategy === "CONNECT_EXISTING" && !submission.existingRepository) {
            throw new Error("Connecting an existing application requires a repository.");
        }
        if (submission.brand.personalities.length === 0) throw new Error("Brand intake requires at least one personality.");
    }
}
