/*
===============================================================================

PBOS Mission Planning Types

Classification

Intermediate Representation

Authority

PBS-PLN

===============================================================================
*/

export type MissionPriority =

    | "CRITICAL"

    | "HIGH"

    | "NORMAL"

    | "LOW";

export interface Mission {

    readonly missionId: string;

    readonly title: string;

    readonly priority: MissionPriority;

    readonly dependencies: readonly string[];

    readonly capability: string;

    readonly generatedFrom: readonly string[];

}
