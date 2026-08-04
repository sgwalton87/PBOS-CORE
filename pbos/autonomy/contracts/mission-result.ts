import { MissionState } from "./mission-state";

export interface MissionResult {
    readonly missionId: string;
    readonly state: MissionState;
    readonly outcome: Readonly<Record<string, unknown>>;
    readonly lineage: readonly string[];
    readonly errors: readonly string[];
    readonly completedAt: Date;
}
