/*
===============================================================================

PBOS Evidence Buffer

Classification

Discovery

Authority

PBS-DSC

===============================================================================

Purpose

Temporarily buffer newly acquired evidence prior to constitutional validation.

Buffered evidence SHALL remain transient.

Validated evidence SHALL enter the Constitutional Evidence Registry.

===============================================================================
*/

export class EvidenceBuffer {

    async add() {

        throw new Error(
            "Evidence Buffer not implemented."
        );

    }

}
