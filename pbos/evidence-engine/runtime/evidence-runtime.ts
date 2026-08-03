/*
===============================================================================

PBOS Evidence Runtime

Authority

PBOS-CIP-003A-011

===============================================================================
*/

import {
    EvidenceRecord
}
from "../contracts/evidence-record";


import {
    EvidenceNormalizer
}
from "../normalization/evidence-normalizer";


import {
    EvidenceValidator
}
from "../validation/evidence-validator";


export interface EvidenceRuntimeResult {

    readonly evidence: EvidenceRecord;

    readonly valid: boolean;

    readonly confidence: number;

}


export class EvidenceRuntime {


    private readonly normalizer =
        new EvidenceNormalizer();


    private readonly validator =
        new EvidenceValidator();



    process(

        evidence: EvidenceRecord

    ): EvidenceRuntimeResult {


        const normalized =
            this.normalizer.normalize(
                evidence
            );


        const validation =
            this.validator.validate(
                normalized
            );


        return {

            evidence: {

                ...normalized,

                status:
                    validation.valid
                        ? "VALIDATED"
                        : "REJECTED",

                confidence:
                    validation.confidence

            },

            valid:
                validation.valid,

            confidence:
                validation.confidence

        };

    }


}
