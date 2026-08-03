/*
===============================================================================

PBOS CLI Command Contract

Authority

PBOS-CLI-002

Classification

Constitutional Contract

===============================================================================

Purpose

Defines the executable contract implemented by every CLI command.

CLI commands SHALL remain orchestration-only.

Business logic SHALL execute within Constitutional Commands.

===============================================================================
*/

import { CommandContext } from "../runtime/command-context";
import { CommandResult } from "./command-result";

export interface Command {

    readonly name: string;

    readonly description: string;

    execute(

        context: CommandContext

    ): Promise<CommandResult>;

}
