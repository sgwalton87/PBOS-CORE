import { KernelAuthorityContract } from "./authority-contract";

export class PermissionRegistry {
    private readonly grants = new Map<string, KernelAuthorityContract>();

    register(grant: KernelAuthorityContract): void {
        this.grants.set(grant.authorityId, grant);
    }

    get(authorityId: string): KernelAuthorityContract | undefined {
        return this.grants.get(authorityId);
    }

    forActor(actorId: string): readonly KernelAuthorityContract[] {
        return [...this.grants.values()].filter(grant => grant.actorId === actorId);
    }
}
