import { MissionQueueItem } from "./contracts";
import { ProductionMissionExecutor } from "./production-mission-runner";

export type ProductionMissionAdapterFactory = (mission: MissionQueueItem) => ProductionMissionExecutor;

/** Explicit execution wiring: a queued mission cannot silently become executable. */
export class ProductionMissionAdapterRegistry {
    private readonly adapters = new Map<string, ProductionMissionAdapterFactory>();

    register(systemId: string, missionId: string, factory: ProductionMissionAdapterFactory): this {
        const key = this.key(systemId, missionId);
        if (!systemId || !missionId) throw new Error("Mission adapter registration requires system and mission identities.");
        if (this.adapters.has(key)) throw new Error(`Mission execution adapter already registered: ${key}`);
        this.adapters.set(key, factory);
        return this;
    }

    resolve(mission: MissionQueueItem): ProductionMissionExecutor | undefined {
        return this.adapters.get(this.key(mission.systemId, mission.missionId))?.(mission);
    }

    coverage(missions: readonly MissionQueueItem[]): Readonly<{ registered: readonly string[]; missing: readonly string[] }> {
        const registered: string[] = [];
        const missing: string[] = [];
        missions.forEach(mission => (this.adapters.has(this.key(mission.systemId, mission.missionId)) ? registered : missing).push(mission.missionId));
        return { registered, missing };
    }

    private key(systemId: string, missionId: string): string { return `${systemId}:${missionId}`; }
}
