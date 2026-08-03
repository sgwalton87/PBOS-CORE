import readline from "node:readline/promises";

import { stdin, stdout } from "node:process";

import {
    DiscoveryExecutionMode
} from "../../commands/discover/contracts/discover-command-contract";

export class DiscoveryMenu {

    async prompt(): Promise<DiscoveryExecutionMode> {

        const rl = readline.createInterface({

            input: stdin,

            output: stdout

        });

        console.log("1. I have an idea");
        console.log("2. I have organizational documents");
        console.log("3. I have existing software");
        console.log("4. I have both");

        const answer = await rl.question("> ");

        rl.close();

        switch(answer.trim()) {

            case "1":

                return "IDEA";

            case "2":

                return "DOCUMENTS";

            case "3":

                return "REPOSITORY";

            case "4":

                return "HYBRID";

            default:

                throw new Error("Invalid discovery mode.");

        }

    }

}
