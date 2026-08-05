import { randomUUID } from "crypto";
import { Mission, WorkPackageGenerator } from "../planner";
import { RepositoryInspection } from "../platform";
import { CapabilityKind, SystemBlueprint } from "../system-blueprint";
import { CapabilityGap, GenesisBuildPlan } from "./contracts";

const PRIORITY: Readonly<Partial<Record<CapabilityKind, Mission["priority"]>>> = {
    IDENTITY: "CRITICAL", WORKFLOWS: "HIGH", DOCUMENTS: "HIGH", EVIDENCE: "HIGH", INTEGRATIONS: "HIGH",
    INTELLIGENCE: "NORMAL", ANALYTICS: "NORMAL", AUTOMATION: "NORMAL"
};

export class GenesisBuildPlanCompiler {
    constructor(private readonly packages = new WorkPackageGenerator()) {}

    async compile(blueprint: SystemBlueprint, inspection: RepositoryInspection): Promise<GenesisBuildPlan> {
        if (blueprint.application.existingRepository) {
            const actual = `${inspection.repository.owner}/${inspection.repository.name}`;
            if (blueprint.application.existingRepository !== actual) throw new Error("Blueprint and repository inspection do not match.");
        }
        const gaps = blueprint.capabilities.filter(capability =>
            !inspection.findings.includes(`CAPABILITY:${capability}:PRESENT`)).map(capability => this.gap(capability, inspection));
        const missions = gaps.map(gap => this.mission(gap, blueprint));
        const generatedPackages = await Promise.all(missions.map(mission => this.packages.generate(mission, [inspection.revision, blueprint.blueprintId])));
        const workPackages = generatedPackages.map((workPackage, index) => ({
            ...workPackage,
            id: `${blueprint.identity.proposedSystemId}:${gaps[index].capability}`
        }));
        const blockers = [...blueprint.unresolvedDecisions];
        return {
            planId: randomUUID(), blueprintId: blueprint.blueprintId, repositoryRevision: inspection.revision,
            blueprint, inspection, gaps, missions, workPackages,
            implementationPlan: workPackages.map((workPackage, index) => ({
                order: index + 1, workPackageId: workPackage.id, title: workPackage.title,
                dependencies: missions[index].dependencies
            })),
            status: blockers.length ? "BLOCKED" : "READY_FOR_APPROVAL", blockers, generatedAt: new Date()
        };
    }

    private gap(capability: CapabilityKind, inspection: RepositoryInspection): CapabilityGap {
        return { capability, reason: `${capability} is required by the blueprint but not proven at ${inspection.revision}.`,
            evidence: [...inspection.findings, inspection.revision], priority: PRIORITY[capability] ?? "LOW" };
    }

    private mission(gap: CapabilityGap, blueprint: SystemBlueprint): Mission {
        const brandEvidence = (blueprint.design.brand.assets ?? [])
            .map(asset => `BRAND_ASSET:${asset.assetId}:${asset.location}`);
        return { missionId: randomUUID(), title: `Implement ${gap.capability.toLowerCase().replaceAll("_", " ")}`,
            priority: gap.priority, dependencies: gap.capability === "IDENTITY" ? [] : ["IDENTITY"],
            capability: gap.capability, generatedFrom: [blueprint.blueprintId, ...brandEvidence, ...gap.evidence] };
    }
}
