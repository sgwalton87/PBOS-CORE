import { DomainContract, DomainRegistry } from "../../kernel";

export class DomainRuntimeLoader {
    constructor(private readonly registry: DomainRegistry) {}

    load(domainIds: readonly string[]): readonly DomainContract[] {
        return domainIds.map(domainId => {
            const domain = this.registry.get(domainId);
            if (!domain) throw new Error(`Runtime domain is not registered: ${domainId}`);
            return domain;
        });
    }
}
