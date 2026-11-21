import { closeSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { evidenceDigest, evidenceJson, evidenceSha256 } from "./remote-attestation";

const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;

/** Controller-only CAS. A separate retention authority governs backups and any eventual deletion. */
export class RemoteEvidenceArchive {
    constructor(private readonly directory: string, private readonly retentionDays: number) {
        const metadata = lstatSync(directory);
        if (realpathSync(directory) !== directory || !metadata.isDirectory() || (metadata.mode & 0o077) !== 0 ||
            !Number.isInteger(retentionDays) || retentionDays < 90 || retentionDays > 3650) {
            throw new Error("Evidence storage requires a canonical private directory and an explicit retention period of 90 days or more.");
        }
    }

    preserve(value: unknown): string {
        const text = evidenceJson({ retainUntil: new Date(Date.now() + this.retentionDays * 86_400_000).toISOString(), value });
        if (Buffer.byteLength(text) > MAX_ARTIFACT_BYTES) throw new Error("Evidence exceeds archive size limit.");
        const digest = evidenceDigest(text);
        const temporary = join(this.directory, `.${randomUUID()}`);
        const file = openSync(temporary, "wx", 0o600);
        try {
            try { writeFileSync(file, text, "utf8"); fsyncSync(file); }
            finally { closeSync(file); }
            try { linkSync(temporary, join(this.directory, digest)); }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
                this.read(digest);
            }
            const directory = openSync(this.directory, "r");
            try { fsyncSync(directory); }
            finally { closeSync(directory); }
        } finally { unlinkSync(temporary); }
        return digest;
    }

    read(digest: string): unknown {
        if (!evidenceSha256(digest)) throw new Error("Invalid archived evidence identity.");
        const path = join(this.directory, digest);
        const metadata = lstatSync(path);
        if (!metadata.isFile() || metadata.size > MAX_ARTIFACT_BYTES || (metadata.mode & 0o077) !== 0) {
            throw new Error("Invalid archived evidence file.");
        }
        const contents = readFileSync(path);
        if (evidenceDigest(contents) !== digest) throw new Error("Archived evidence digest mismatch.");
        return JSON.parse(contents.toString("utf8")).value as unknown;
    }
}
