import { ActorIdentity } from "../../kernel";
import { randomUUID } from "crypto";
import type { IntegrationStateRepository } from "../state/contracts";

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
    constructor(private readonly repository?: IntegrationStateRepository, private readonly organizationId = "PBOS-DEFAULT-ORG") {
        repository?.identities(organizationId).forEach(mapping => this.mappings.set(mapping.mappingId, mapping));
    }
    map(mapping: IdentityMapping): void {
        const existing = this.get(mapping.mappingId);
        if (existing) {
            const sameIdentity = JSON.stringify(existing.externalIdentity) === JSON.stringify(mapping.externalIdentity) &&
                JSON.stringify(existing.pbosIdentity) === JSON.stringify(mapping.pbosIdentity);
            if (sameIdentity) return;
            throw new Error(`Identity mapping already registered with different authority context: ${mapping.mappingId}`);
        }
        if (mapping.externalIdentity.active !== mapping.pbosIdentity.active ||
            !mapping.externalIdentity.authorityReferences.every(reference => mapping.pbosIdentity.authorityContext.includes(reference))) {
            throw new Error("Identity mapping does not preserve authority context.");
        }
        if (!mapping.pbosIdentity.provenance.includes(mapping.externalIdentity.externalIdentityId)) {
            throw new Error("Identity mapping does not preserve external provenance.");
        }
        this.mappings.set(mapping.mappingId, mapping);
        this.repository?.saveIdentity(this.organizationId, mapping);
    }
    revoke(mappingId: string, reason: string, revokedBy: string, approvalId: string): IdentityMapping {
        const current = this.get(mappingId);
        if (!current) throw new Error(`Identity mapping not found: ${mappingId}`);
        const revoked = { ...current, externalIdentity: { ...current.externalIdentity, active: false },
            pbosIdentity: { ...current.pbosIdentity, active: false } };
        this.repository?.revoke({ revocationId: randomUUID(), organizationId: this.organizationId,
            resourceType: "IDENTITY", resourceId: mappingId, reason, revokedBy, approvalId, revokedAt: new Date() });
        this.mappings.set(mappingId, revoked);
        this.repository?.saveIdentity(this.organizationId, revoked);
        return revoked;
    }
    get(mappingId: string): IdentityMapping | undefined { return this.values().find(mapping => mapping.mappingId === mappingId); }
    forExternalIdentity(externalIdentityId: string): readonly IdentityMapping[] {
        return this.values().filter(mapping => mapping.externalIdentity.externalIdentityId === externalIdentityId);
    }
    private values(): IdentityMapping[] {
        const identities = [...(this.repository?.identities(this.organizationId) ?? this.mappings.values())];
        const revoked = new Set(this.repository?.revocations(this.organizationId)
            .filter(item => item.resourceType === "IDENTITY").map(item => item.resourceId) ?? []);
        return identities.map(mapping => revoked.has(mapping.mappingId) ? { ...mapping,
            externalIdentity: { ...mapping.externalIdentity, active: false },
            pbosIdentity: { ...mapping.pbosIdentity, active: false } } : mapping);
    }
}
