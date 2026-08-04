import { AutonomousBuildGrant } from "./contracts";

export class BuildGrantRegistry {
    private readonly grants = new Map<string, AutonomousBuildGrant>();

    register(grant: AutonomousBuildGrant): void {
        if (this.grants.has(grant.grantId)) throw new Error(`Build grant already registered: ${grant.grantId}`);
        this.grants.set(grant.grantId, grant);
    }

    get(grantId: string): AutonomousBuildGrant | undefined {
        return this.grants.get(grantId);
    }

    update(grant: AutonomousBuildGrant): void {
        if (!this.grants.has(grant.grantId)) throw new Error(`Build grant not found: ${grant.grantId}`);
        this.grants.set(grant.grantId, grant);
    }

    activeForSystem(systemId: string, at = new Date()): readonly AutonomousBuildGrant[] {
        return [...this.grants.values()].filter(grant =>
            grant.systemId === systemId && !grant.revokedAt && grant.expiresAt > at
        );
    }
}
