export type KernelMissionState = "CREATED" | "ACTIVE" | "SUSPENDED" | "COMPLETED" | "FAILED";

export interface KernelMission {
    readonly missionId: string;
    readonly systemId: string;
    readonly name: string;
    readonly purpose: string;
    readonly objectives: readonly string[];
    readonly state: KernelMissionState;
    readonly updatedAt: Date;
}
