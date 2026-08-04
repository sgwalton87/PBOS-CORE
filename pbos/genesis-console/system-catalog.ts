import { GenesisSystemDefinition } from "./system-definition";

export class GenesisSystemCatalog {
    private readonly systems = new Map<string, GenesisSystemDefinition>();

    constructor(initial: readonly GenesisSystemDefinition[] = []) {
        initial.forEach(system => this.register(system));
    }

    register(system: GenesisSystemDefinition): void {
        if (this.systems.has(system.systemId)) throw new Error(`Genesis system already registered: ${system.systemId}`);
        this.systems.set(system.systemId, system);
    }

    get(systemId: string): GenesisSystemDefinition | undefined {
        return this.systems.get(systemId);
    }

    all(): readonly GenesisSystemDefinition[] {
        return [...this.systems.values()];
    }
}
