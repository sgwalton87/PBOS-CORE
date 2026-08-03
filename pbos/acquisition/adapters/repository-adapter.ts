/*
===============================================================================

PBOS Repository Acquisition Adapter

Classification

Acquisition Adapter

Authority

PBS-ACQ

===============================================================================

Purpose

Acquire organizational implementation evidence from existing software
repositories.

The Repository Acquisition Adapter SHALL inventory repositories prior to
Constitutional Discovery.

Repository acquisition provides implementation evidence.

Repository acquisition SHALL NOT replace Constitutional Discovery.

===============================================================================

Responsibilities

• inspect repository structure

• inventory projects

• identify programming languages

• identify frameworks

• identify build systems

• identify reusable capabilities

===============================================================================

Constitutional Law

Repositories SHALL remain acquisition sources.

Implementation SHALL NEVER override organizational intent.

===============================================================================
*/

export class RepositoryAcquisitionAdapter {

    async acquire(): Promise<void> {

        throw new Error(
            "Repository Acquisition not implemented."
        );

    }

}
