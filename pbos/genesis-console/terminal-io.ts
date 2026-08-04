import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";

export interface TerminalIO {
    write(message: string): void;
    prompt(message: string): Promise<string>;
    close(): void;
}

export class NodeTerminalIO implements TerminalIO {
    private readonly terminal = createInterface({ input: stdin, output: stdout });

    write(message: string): void {
        stdout.write(`${message}\n`);
    }

    prompt(message: string): Promise<string> {
        return this.terminal.question(message);
    }

    close(): void {
        this.terminal.close();
    }
}
