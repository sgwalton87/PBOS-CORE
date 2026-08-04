export type FactorySystemLifecycle = "GENERATED" | "APPROVED" | "DEPLOYED" | "SUSPENDED" | "RETIRED";

export interface FactorySystemRecord {
    readonly systemId: string;
    readonly name: string;
    readonly version: string;
    readonly ownerId: string;
    readonly lifecycle: FactorySystemLifecycle;
    readonly deploymentIds: readonly string[];
    readonly updatedAt: Date;
}

const TRANSITIONS: Readonly<Record<FactorySystemLifecycle, readonly FactorySystemLifecycle[]>> = {
    GENERATED: ["APPROVED", "SUSPENDED", "RETIRED"],
    APPROVED: ["DEPLOYED", "SUSPENDED", "RETIRED"],
    DEPLOYED: ["SUSPENDED", "RETIRED"],
    SUSPENDED: ["APPROVED", "DEPLOYED", "RETIRED"],
    RETIRED: []
};

export class FactorySystemCatalog {
    private readonly systems = new Map<string, FactorySystemRecord>();
    register(system: FactorySystemRecord): void {
        if (this.systems.has(system.systemId)) throw new Error(`Factory system already registered: ${system.systemId}`);
        this.systems.set(system.systemId, system);
    }
    update(system: FactorySystemRecord): void {
        const current = this.systems.get(system.systemId);
        if (!current) throw new Error(`Factory system not found: ${system.systemId}`);
        if (current.lifecycle !== system.lifecycle && !TRANSITIONS[current.lifecycle].includes(system.lifecycle)) {
            throw new Error(`Invalid factory system transition: ${current.lifecycle} -> ${system.lifecycle}`);
        }
        this.systems.set(system.systemId, system);
    }
    get(systemId: string): FactorySystemRecord | undefined { return this.systems.get(systemId); }
    all(): readonly FactorySystemRecord[] { return [...this.systems.values()]; }
}
