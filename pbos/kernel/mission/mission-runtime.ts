import { KernelMission, KernelMissionState } from "./mission-contract";

const TRANSITIONS: Readonly<Record<KernelMissionState, readonly KernelMissionState[]>> = {
    CREATED: ["ACTIVE", "FAILED"],
    ACTIVE: ["SUSPENDED", "COMPLETED", "FAILED"],
    SUSPENDED: ["ACTIVE", "FAILED"],
    COMPLETED: [],
    FAILED: []
};

export class MissionRuntime {
    private readonly missions = new Map<string, KernelMission>();

    register(mission: KernelMission): void {
        if (this.missions.has(mission.missionId)) throw new Error(`Mission already registered: ${mission.missionId}`);
        this.missions.set(mission.missionId, mission);
    }

    transition(missionId: string, state: KernelMissionState): KernelMission {
        const mission = this.missions.get(missionId);
        if (!mission) throw new Error(`Mission not found: ${missionId}`);
        if (!TRANSITIONS[mission.state].includes(state)) {
            throw new Error(`Invalid mission transition: ${mission.state} -> ${state}`);
        }
        const next = { ...mission, state, updatedAt: new Date() };
        this.missions.set(missionId, next);
        return next;
    }

    get(missionId: string): KernelMission | undefined {
        return this.missions.get(missionId);
    }

    active(systemId: string): readonly KernelMission[] {
        return [...this.missions.values()].filter(mission => mission.systemId === systemId && mission.state === "ACTIVE");
    }

    all(systemId: string): readonly KernelMission[] {
        return [...this.missions.values()].filter(mission => mission.systemId === systemId);
    }
}
