import { DomainContract } from "./domain-contract";

export class DomainRegistry {
    private readonly domains = new Map<string, DomainContract>();

    register(domain: DomainContract): void {
        if (this.domains.has(domain.domainId)) {
            throw new Error(`Domain already registered: ${domain.domainId}`);
        }
        this.domains.set(domain.domainId, domain);
    }

    get(domainId: string): DomainContract | undefined {
        return this.domains.get(domainId);
    }

    forSystem(systemId: string): readonly DomainContract[] {
        return [...this.domains.values()].filter(domain => domain.systemIds.includes(systemId));
    }

    all(): readonly DomainContract[] {
        return [...this.domains.values()];
    }
}
