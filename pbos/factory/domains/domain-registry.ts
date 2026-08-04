import { DomainTemplate } from "../templates/domain-template";

export interface FactoryDomainRegistration {
    readonly domainId: string;
    readonly systemId: string;
    readonly template: DomainTemplate;
    readonly active: boolean;
    readonly registeredAt: Date;
}

export class FactoryDomainRegistry {
    private readonly domains = new Map<string, FactoryDomainRegistration>();
    register(domain: FactoryDomainRegistration): void {
        if (this.domains.has(domain.domainId)) throw new Error(`Factory domain already registered: ${domain.domainId}`);
        this.domains.set(domain.domainId, domain);
    }
    update(domain: FactoryDomainRegistration): void {
        if (!this.domains.has(domain.domainId)) throw new Error(`Factory domain not found: ${domain.domainId}`);
        this.domains.set(domain.domainId, domain);
    }
    get(domainId: string): FactoryDomainRegistration | undefined { return this.domains.get(domainId); }
    forSystem(systemId: string): readonly FactoryDomainRegistration[] {
        return [...this.domains.values()].filter(domain => domain.systemId === systemId);
    }
}
