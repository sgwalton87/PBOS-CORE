import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import { randomUUID } from "crypto";

export class JsonStateStore<T> {
    constructor(private readonly path: string, private readonly initial: () => T) {}

    read(): T {
        try {
            return JSON.parse(readFileSync(this.path, "utf8")) as T;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.initial();
            throw error;
        }
    }

    write(value: T): void {
        mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
        const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
        writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
        renameSync(temporary, this.path);
    }

    update(change: (current: T) => T): T {
        const updated = change(this.read());
        this.write(updated);
        return updated;
    }
}
