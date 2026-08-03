/*
===============================================================================

PBOS Repository Adapter

Classification

Discovery Adapter

Authority

PBS-DSC

===============================================================================

Purpose

Acquire Constitutional Understanding from existing software repositories.

Repositories provide implementation evidence.

Repositories SHALL NOT replace Constitutional Discovery.

Repository understanding SHALL complement organizational understanding.

===============================================================================

Responsibilities

• inspect repository structure

• analyze architecture

• inventory capabilities

• identify reusable systems

• generate implementation evidence

===============================================================================

Constitutional Law

Repository evidence SHALL remain separate from Constitutional Evidence.

Implementation SHALL never override organizational intent.

===============================================================================
*/

export class RepositoryAdapter {

    async discover() {

        throw new Error(
            "Repository Discovery not implemented."
        );

    }

}
