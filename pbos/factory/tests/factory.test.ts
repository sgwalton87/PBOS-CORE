import { describe, expect, it } from "vitest";
import {
    DomainManager, DomainTemplate, FactoryDomainRegistry, FactoryPolicyEvaluator,
    FactorySystemCatalog, SystemGenerator, SystemIsolation, SystemTemplate
} from "../index";

const domain: DomainTemplate = {
    domainTemplateId: "domain-template", name: "Domain", classification: "specialized",
    version: "1.0.0", capabilityIds: ["capability"], requiredServiceIds: [], metadata: {}
};
const template: SystemTemplate = {
    systemTemplateId: "system-template", name: "PBOS System", version: "1.0.0",
    kernelVersion: "1.0.0", runtimeVersion: "1.0.0", intelligenceVersion: "1.0.0",
    allowedDomainTemplateIds: [domain.domainTemplateId], requiredPolicyIds: ["factory-policy"], metadata: {}
};

describe("PBOS Multi-System Factory", () => {
    it("generates independent systems from a shared foundation", () => {
        const generator = new SystemGenerator();
        const first = generator.generate(generator.plan(template, [domain], "First", "owner-a"), template);
        const second = generator.generate(generator.plan(template, [domain], "Second", "owner-b"), template);
        expect(first.systemId).not.toBe(second.systemId);
        expect(first.sharedFoundation).toEqual(second.sharedFoundation);
    });

    it("rejects domains outside the system template", () => {
        expect(() => new SystemGenerator().plan(template, [{ ...domain, domainTemplateId: "other" }], "System", "owner"))
            .toThrow("Domain templates not permitted");
    });

    it("registers and activates domains independently", () => {
        const registry = new FactoryDomainRegistry();
        registry.register({ domainId: "system-a:domain", systemId: "system-a", template: domain, active: false, registeredAt: new Date() });
        expect(new DomainManager(registry).activate("system-a:domain").active).toBe(true);
        expect(registry.get("system-a:domain")?.active).toBe(true);
    });

    it("prevents identity and data crossover", () => {
        const isolation = new SystemIsolation();
        const first = { systemId: "a", domainIds: ["domain"], actorIds: ["actor"], dataScopeIds: ["data-a"] };
        expect(() => isolation.assertAccess(first, { ...first, systemId: "b" }, "actor")).toThrow("Cross-system access denied");
        expect(() => isolation.assertAccess(first, first, "other")).toThrow("actor access denied");
        expect(() => isolation.assertAccess(first, first, "actor", undefined, "other-domain")).toThrow("Cross-domain access denied");
    });

    it("enforces factory creation governance", () => {
        const evaluator = new FactoryPolicyEvaluator();
        const policy = { policyId: "policy", allowedCreatorIds: ["creator"], requiredApproval: true, evolutionRequiresCertification: true };
        const authority = { allowed: true, actorId: "creator", action: "CREATE_SYSTEM", authorityId: "authority", reason: "permitted" };
        expect(() => evaluator.authorizeCreation(policy, "creator", authority)).toThrow("explicit approval");
        evaluator.authorizeCreation(policy, "creator", authority, "approval");
    });

    it("tracks independent ownership and lifecycle", () => {
        const catalog = new FactorySystemCatalog();
        catalog.register({ systemId: "system", name: "System", version: "1.0.0", ownerId: "owner", lifecycle: "GENERATED", deploymentIds: [], updatedAt: new Date() });
        expect(() => catalog.update({ ...catalog.get("system")!, lifecycle: "DEPLOYED", updatedAt: new Date() })).toThrow("Invalid factory system transition");
        catalog.update({ ...catalog.get("system")!, lifecycle: "APPROVED", updatedAt: new Date() });
        catalog.update({ ...catalog.get("system")!, lifecycle: "DEPLOYED", deploymentIds: ["deployment"], updatedAt: new Date() });
        expect(catalog.get("system")?.lifecycle).toBe("DEPLOYED");
    });
});
