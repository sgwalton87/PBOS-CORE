/*
===============================================================================

PBOS Evidence Report

Authority

PBOS-CIP-003A-012

===============================================================================
*/

import {
    EvidenceRecord
}
from "../contracts/evidence-record";


export interface EvidenceReport {


    readonly id: string;

    readonly generatedAt: Date;

    readonly evidenceCount: number;

    readonly validatedCount: number;

    readonly rejectedCount: number;

    readonly confidenceAverage: number;

    readonly evidence: readonly EvidenceRecord[];

}


export function createEvidenceReport(

    evidence: readonly EvidenceRecord[]

): EvidenceReport {


    const validated =
        evidence.filter(
            item =>
                item.status === "VALIDATED"
        );


    const rejected =
        evidence.filter(
            item =>
                item.status === "REJECTED"
        );


    const confidenceTotal =
        evidence.reduce(

            (sum, item) =>
                sum + item.confidence,

            0

        );


    return {

        id:
            crypto.randomUUID(),

        generatedAt:
            new Date(),

        evidenceCount:
            evidence.length,

        validatedCount:
            validated.length,

        rejectedCount:
            rejected.length,

        confidenceAverage:
            evidence.length === 0
                ? 0
                : confidenceTotal / evidence.length,

        evidence

    };

}
