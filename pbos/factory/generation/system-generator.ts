import { randomUUID } from "crypto";
import { DomainTemplate } from "../templates/domain-template";
import { SystemTemplate } from "../templates/system-template";
import { GeneratedSystemDefinition, GenerationPlan } from "./generation-plan";

export class SystemGenerator {
    plan(template: SystemTemplate, domains: readonly DomainTemplate[], systemName: string, ownerId: string): GenerationPlan {
        if (!systemName || !ownerId) throw new Error("System name and owner are required.");
        const unauthorized = domains.filter(domain => !template.allowedDomainTemplateIds.includes(domain.domainTemplateId));
        if (unauthorized.length > 0) throw new Error(`Domain templates not permitted: ${unauthorized.map(domain => domain.domainTemplateId).join(", ")}`);
        const systemId = randomUUID();
        return {
            generationId: randomUUID(), systemId, systemName, ownerId,
            systemTemplateId: template.systemTemplateId,
            domainTemplateIds: domains.map(domain => domain.domainTemplateId),
            steps: ["VALIDATE_TEMPLATE", "CREATE_SYSTEM_IDENTITY", "BIND_SHARED_FOUNDATION", "REGISTER_DOMAINS"],
            status: "PLANNED", createdAt: new Date()
        };
    }

    generate(plan: GenerationPlan, template: SystemTemplate): GeneratedSystemDefinition {
        if (plan.systemTemplateId !== template.systemTemplateId) throw new Error("Generation plan template mismatch.");
        return {
            systemId: plan.systemId, name: plan.systemName, version: template.version, ownerId: plan.ownerId,
            templateId: template.systemTemplateId, domainIds: plan.domainTemplateIds,
            sharedFoundation: {
                kernelVersion: template.kernelVersion,
                runtimeVersion: template.runtimeVersion,
                intelligenceVersion: template.intelligenceVersion
            },
            lifecycle: "GENERATED", generatedAt: new Date()
        };
    }
}
