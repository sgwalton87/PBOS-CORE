import { closeSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
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
        return this.publish(Buffer.from(text, "utf8"));
    }

    private publish(text: Buffer): string {
        if (text.length > MAX_ARTIFACT_BYTES) throw new Error("Evidence exceeds archive size limit.");
        const digest = evidenceDigest(text);
        const temporary = join(this.directory, `.${randomUUID()}`);
        const file = openSync(temporary, "wx", 0o600);
        try {
            try { writeFileSync(file, text); fsyncSync(file); }
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

    private readVerified(digest: string): Buffer {
        if (!evidenceSha256(digest)) throw new Error("Invalid archived evidence identity.");
        const path = join(this.directory, digest);
        const metadata = lstatSync(path);
        if (!metadata.isFile() || metadata.size > MAX_ARTIFACT_BYTES || (metadata.mode & 0o077) !== 0) {
            throw new Error("Invalid archived evidence file.");
        }
        const contents = readFileSync(path);
        if (evidenceDigest(contents) !== digest) throw new Error("Archived evidence digest mismatch.");
        return contents;
    }

    read(digest: string): unknown {
        return JSON.parse(this.readVerified(digest).toString("utf8")).value as unknown;
    }

    /** Store the returned encrypted envelope in a separately retained backup location. */
    sealBackup(digest: string, key: Buffer): Buffer {
        const nonce = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, nonce);
        cipher.setAAD(Buffer.from(`pbos-evidence-v1:${digest}`));
        const encrypted = Buffer.concat([cipher.update(this.readVerified(digest)), cipher.final()]);
        return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    }

    restoreBackup(digest: string, envelope: Buffer, key: Buffer): void {
        if (!evidenceSha256(digest) || envelope.length <= 28 || envelope.length > MAX_ARTIFACT_BYTES + 28) {
            throw new Error("Invalid evidence backup envelope.");
        }
        const decipher = createDecipheriv("aes-256-gcm", key, envelope.subarray(0, 12));
        decipher.setAAD(Buffer.from(`pbos-evidence-v1:${digest}`));
        decipher.setAuthTag(envelope.subarray(12, 28));
        const restored = Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]);
        if (evidenceDigest(restored) !== digest) throw new Error("Restored evidence digest mismatch.");
        const retainedUntil = Date.parse(JSON.parse(restored.toString("utf8")).retainUntil);
        if (!(retainedUntil > Date.now())) throw new Error("Evidence backup is outside its retention window.");
        this.publish(restored);
    }
}
