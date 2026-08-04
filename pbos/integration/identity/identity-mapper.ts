import { ActorIdentity } from "../../kernel";

export interface ExternalIdentity {
    readonly externalIdentityId: string;
    readonly externalSystemId: string;
    readonly role: string;
    readonly authorityReferences: readonly string[];
    readonly active: boolean;
}

export interface IdentityMapping {
    readonly mappingId: string;
    readonly externalIdentity: ExternalIdentity;
    readonly pbosIdentity: ActorIdentity;
    readonly mappedAt: Date;
}

export class IdentityMapper {
    private readonly mappings = new Map<string, IdentityMapping>();
    map(mapping: IdentityMapping): void {
        if (this.mappings.has(mapping.mappingId)) throw new Error(`Identity mapping already registered: ${mapping.mappingId}`);
        if (mapping.externalIdentity.active !== mapping.pbosIdentity.active ||
            !mapping.externalIdentity.authorityReferences.every(reference => mapping.pbosIdentity.authorityContext.includes(reference))) {
            throw new Error("Identity mapping does not preserve authority context.");
        }
        if (!mapping.pbosIdentity.provenance.includes(mapping.externalIdentity.externalIdentityId)) {
            throw new Error("Identity mapping does not preserve external provenance.");
        }
        this.mappings.set(mapping.mappingId, mapping);
    }
    get(mappingId: string): IdentityMapping | undefined { return this.mappings.get(mappingId); }
    forExternalIdentity(externalIdentityId: string): readonly IdentityMapping[] {
        return [...this.mappings.values()].filter(mapping => mapping.externalIdentity.externalIdentityId === externalIdentityId);
    }
}
