import { MissionQueueItem } from "./contracts";
import { ProductionMissionExecutor } from "./production-mission-runner";

export type ProductionMissionAdapterFactory = (mission: MissionQueueItem) => ProductionMissionExecutor;

export interface ProductionMissionAdapterCapabilities {
    readonly producesFunctionalAcceptancePlan?: boolean;
}

interface ProductionMissionAdapterRegistration {
    readonly factory: ProductionMissionAdapterFactory;
    readonly capabilities: ProductionMissionAdapterCapabilities;
}

/** Explicit execution wiring: a queued mission cannot silently become executable. */
export class ProductionMissionAdapterRegistry {
    private readonly adapters = new Map<string, ProductionMissionAdapterRegistration>();

    register(systemId: string, missionId: string, factory: ProductionMissionAdapterFactory,
        capabilities: ProductionMissionAdapterCapabilities = {}): this {
        const key = this.key(systemId, missionId);
        if (!systemId || !missionId) throw new Error("Mission adapter registration requires system and mission identities.");
        if (this.adapters.has(key)) throw new Error(`Mission execution adapter already registered: ${key}`);
        this.adapters.set(key, { factory, capabilities });
        return this;
    }

    resolve(mission: MissionQueueItem): ProductionMissionExecutor | undefined {
        const registration = this.adapters.get(this.key(mission.systemId, mission.missionId));
        if (!registration) return undefined;
        if (mission.completionPolicy?.kind === "FUNCTIONAL_APPLICATION" &&
            !registration.capabilities.producesFunctionalAcceptancePlan) return undefined;
        return registration.factory(mission);
    }

    coverage(missions: readonly MissionQueueItem[]): Readonly<{ registered: readonly string[]; missing: readonly string[] }> {
        const registered: string[] = [];
        const missing: string[] = [];
        missions.forEach(mission => (this.resolveRegistration(mission) ? registered : missing).push(mission.missionId));
        return { registered, missing };
    }

    private resolveRegistration(mission: MissionQueueItem): ProductionMissionAdapterRegistration | undefined {
        const registration = this.adapters.get(this.key(mission.systemId, mission.missionId));
        if (!registration) return undefined;
        return mission.completionPolicy?.kind !== "FUNCTIONAL_APPLICATION" ||
            registration.capabilities.producesFunctionalAcceptancePlan ? registration : undefined;
    }

    private key(systemId: string, missionId: string): string { return `${systemId}:${missionId}`; }
}
