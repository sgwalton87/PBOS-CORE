export interface EcosystemOrganization {
    readonly organizationId: string;
    readonly name: string;
    readonly ownerIds: readonly string[];
    readonly relatedOrganizationIds: readonly string[];
    readonly deployedSystemIds: readonly string[];
}

export class EcosystemRegistry {
    private readonly organizations = new Map<string, EcosystemOrganization>();
    register(organization: EcosystemOrganization): void {
        if (this.organizations.has(organization.organizationId)) throw new Error(`Ecosystem organization already registered: ${organization.organizationId}`);
        this.organizations.set(organization.organizationId, organization);
    }
    get(organizationId: string): EcosystemOrganization | undefined { return this.organizations.get(organizationId); }
    recordDeployment(organizationId: string, systemId: string): EcosystemOrganization {
        const organization = this.organizations.get(organizationId);
        if (!organization) throw new Error(`Ecosystem organization not found: ${organizationId}`);
        const updated = { ...organization, deployedSystemIds: [...new Set([...organization.deployedSystemIds, systemId])] };
        this.organizations.set(organizationId, updated);
        return updated;
    }
}
