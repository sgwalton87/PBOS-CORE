import { FactoryDomainRegistration, FactoryDomainRegistry } from "./domain-registry";

export class DomainManager {
    constructor(private readonly registry: FactoryDomainRegistry) {}
    activate(domainId: string): FactoryDomainRegistration {
        const domain = this.registry.get(domainId);
        if (!domain) throw new Error(`Factory domain not found: ${domainId}`);
        const active = { ...domain, active: true };
        this.registry.update(active);
        return active;
    }
}
