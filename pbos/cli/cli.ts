/*
===============================================================================

PBOS Genesis CLI

Authority

PBOS-CLI-001

===============================================================================

Purpose

Executable entrypoint into PBOS Genesis.

Responsibilities

• Execute Boot Sequence

• Route Commands

• Return Exit Codes

===============================================================================
*/

import { BootSequence } from "../boot";

import { CommandRouter } from "./runtime/command-router";

export class CLI {

    async execute(
        argv: readonly string[]
    ): Promise<number> {

        await BootSequence.initialize();

        const router = new CommandRouter();

        return router.route(argv);

    }

}
