/*
===============================================================================

PBOS Evidence Validator

Authority

PBOS-CIP-003A-009

===============================================================================
*/

import {
    EvidenceRecord
}
from "../contracts/evidence-record";


export interface EvidenceValidationResult {

    readonly valid: boolean;

    readonly confidence: number;

    readonly reasons: readonly string[];

}


export class EvidenceValidator {


    validate(

        evidence: EvidenceRecord

    ): EvidenceValidationResult {


        const reasons: string[] = [];


        if (!evidence.source.verified) {

            reasons.push(
                "Evidence source is not verified."
            );

        }


        if (!evidence.payload) {

            reasons.push(
                "Evidence payload is empty."
            );

        }


        return {

            valid:
                reasons.length === 0,

            confidence:
                reasons.length === 0
                    ? 1
                    : 0,

            reasons

        };

    }


}
