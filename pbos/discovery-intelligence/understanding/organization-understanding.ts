/*
===============================================================================

PBOS Organizational Understanding

Authority

PBOS-DI-008

===============================================================================
*/

import { ConfidenceScore }
from "../confidence/confidence-engine";

export interface OrganizationUnderstanding {

    readonly organizationId: string;

    readonly confidence: ConfidenceScore;

    readonly summary: string;

}

export class OrganizationUnderstandingBuilder {

    build(

        organizationId: string,

        confidence: ConfidenceScore

    ): OrganizationUnderstanding {

        return {

            organizationId,

            confidence,

            summary:

                "Organizational understanding initialized."

        };

    }

}
