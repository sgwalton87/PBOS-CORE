import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
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
        this.withLock(() => this.writeUnlocked(value));
    }

    update(change: (current: T) => T): T {
        return this.withLock(() => {
            const updated = change(this.read());
            this.writeUnlocked(updated);
            return updated;
        });
    }

    private writeUnlocked(value: T): void {
        mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
        const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
        writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
        renameSync(temporary, this.path);
    }

    private withLock<R>(operation: () => R): R {
        mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
        const lockPath = `${this.path}.lock`;
        let descriptor: number | undefined;
        const wait = new Int32Array(new SharedArrayBuffer(4));
        // Cross-process production telemetry and background validation can
        // legitimately overlap. Wait for the full stale-lock window instead
        // of failing after two seconds and abandoning an active mission.
        for (let attempt = 0; attempt < 1_600; attempt += 1) {
            try {
                descriptor = openSync(lockPath, "wx", 0o600);
                writeFileSync(descriptor, `${process.pid} ${Date.now()}\n`, "utf8");
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
                try {
                    if (Date.now() - statSync(lockPath).mtimeMs > 30_000) unlinkSync(lockPath);
                } catch (inspectionError) {
                    if ((inspectionError as NodeJS.ErrnoException).code !== "ENOENT") throw inspectionError;
                }
                Atomics.wait(wait, 0, 0, 20);
            }
        }
        if (descriptor === undefined) throw new Error(`PBOS state store is busy: ${this.path}`);
        try { return operation(); }
        finally {
            closeSync(descriptor);
            try { unlinkSync(lockPath); } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            }
        }
    }
}
