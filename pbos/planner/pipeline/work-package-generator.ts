/*
===============================================================================

PBOS Constitutional Work Package Generator

Classification

Planning Compiler

Authority

PBS-PLN

===============================================================================

Purpose

Compile a Constitutional Mission into an executable Work Package.

A Work Package is the constitutional contract delivered to an implementation
engine.

Implementation engines SHALL implement.

They SHALL NOT reinterpret organizational intent.

===============================================================================

Work Package Contents

Mission

↓

Evidence

↓

Acceptance Criteria

↓

Validation Rules

↓

Certification Requirements

↓

Implementation Contract

===============================================================================

Constitutional Law

Every Work Package SHALL preserve:

• constitutional authority;

• organizational intent;

• evidence lineage;

• deterministic scope;

• validation requirements;

• certification requirements.

===============================================================================
*/

import { randomUUID } from "crypto";
import { Mission } from "../types/planner";

export interface WorkPackage {

    readonly id: string;

    readonly missionId: string;

    readonly title: string;

    readonly acceptanceCriteria: readonly string[];

    readonly validationRules: readonly string[];

    readonly certificationRequirements: readonly string[];

    readonly evidence: readonly string[];

}

export class WorkPackageGenerator {

    async generate(mission: Mission, evidence: readonly string[] = []): Promise<WorkPackage> {
        if (!mission.missionId || !mission.title || !mission.capability) {
            throw new Error("Work package generation requires a traceable mission.");
        }
        return {
            id: randomUUID(),
            missionId: mission.missionId,
            title: mission.title,
            acceptanceCriteria: [
                `${mission.capability} is implemented within the selected system boundary.`,
                "Authority, identity, and evidence lineage are preserved.",
                "Failure and unauthorized paths are covered by tests."
            ],
            validationRules: ["npm run typecheck", "npm test", "npm run build"],
            certificationRequirements: ["Passing validation evidence", "Human certification approval"],
            evidence: [...new Set([...mission.generatedFrom, ...evidence])]
        };

    }

}
