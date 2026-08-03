import { BootContext } from "../../boot";

export class CommandContext {

    constructor(

        public readonly boot: BootContext,

        public readonly argv: readonly string[]

    ) {}

}
