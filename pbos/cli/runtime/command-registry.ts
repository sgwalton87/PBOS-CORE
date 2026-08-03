/*
===============================================================================

PBOS Command Registry

Authority

PBOS-CLI-006

Classification

Constitutional Runtime

===============================================================================

Purpose

Maintains the registry of executable PBOS CLI commands.

The registry SHALL be the canonical source for command resolution.

===============================================================================
*/

import { Command } from "../contracts/command";
import { DiscoverCliCommand } from "../commands/discover";

export class CommandRegistry {

    private readonly commands = new Map<string, Command>();

    constructor() {

        this.register(
            new DiscoverCliCommand()
        );

    }

    register(command: Command): void {

        this.commands.set(
            command.name,
            command
        );

    }

    resolve(
        name: string
    ): Command | undefined {

        return this.commands.get(name);

    }

}
