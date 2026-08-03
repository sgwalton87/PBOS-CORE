import { Command } from "../contracts/command";
import { CommandContext } from "../runtime/command-context";
import { CommandResult } from "../contracts/command-result";

import { DiscoverCommand } from "../../commands/discover";

export class DiscoverCliCommand implements Command {

    readonly name = "discover";

    readonly description =
        "Launch PBOS Discovery";

    async execute(
        context: CommandContext
    ): Promise<CommandResult> {

        void context;

        const discover =
            new DiscoverCommand();

        const result =
            await discover.execute();

        return {

            success: true,

            exitCode: 0,

            message: "Discovery initialized.",

            artifacts: [

                result.sessionId

            ]

        };

    }

}
