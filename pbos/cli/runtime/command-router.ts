import { BootContext } from "../../boot";

import { CommandContext } from "./command-context";

import { CommandRegistry } from "./command-registry";

export class CommandRouter {

    async route(
        argv: readonly string[]
    ): Promise<number> {

        const registry =
            new CommandRegistry();

        const commandName =
            argv[2] ?? "discover";

        const command =
            registry.resolve(commandName);

        if (!command) {

            console.error(
                `Unknown command: ${commandName}`
            );

            return 1;

        }

        const context =
            new CommandContext(
                new BootContext(),
                argv
            );

        const result =
            await command.execute(
                context
            );

        if (result.message) {

            console.log(
                result.message
            );

        }

        return result.exitCode;

    }

}
