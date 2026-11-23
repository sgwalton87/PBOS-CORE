import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectExistingOperatorRuntime, operatorStateFiles, operatorStateSetDigest } from "./operator-readonly-preflight";

export const sealedAdmissionSnapshotName = "snapshot.aes256gcm";
const version = 1;
const headerSize = 29;
const maxSealedBytes = 32 * 1024 * 1024;

export function readAdmissionKey(path: string): Buffer {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 64) throw Error("Invalid admission key file.");
    const text = readFileSync(path, "utf8").trim();
    const key = Buffer.from(text, "base64");
    if (key.length !== 32 || key.toString("base64") !== text) throw Error("Invalid admission key format.");
    return key;
}

function stateSetPin(files: readonly Buffer[]): string {
    return operatorStateSetDigest(files.map(file => createHash("sha256").update(file).digest("hex")));
}

function associatedData(pin: string): Buffer {
    if (!/^[a-f0-9]{64}$/.test(pin)) throw Error("Invalid admission snapshot pin.");
    return Buffer.from("pbos.mb03.observation.v1:" + pin, "ascii");
}

export function sealAdmissionSnapshot(files: readonly Buffer[], key: Buffer, pin: string): Buffer {
    if (files.length !== operatorStateFiles.length || files.some(file => file.length === 0) || stateSetPin(files) !== pin) {
        throw Error("Admission snapshot does not match the independently reviewed state set.");
    }
    const plaintext = Buffer.from(JSON.stringify(files.map(file => file.toString("base64"))));
    if (plaintext.length + headerSize > maxSealedBytes) throw Error("Admission snapshot exceeds its size bound.");
    try {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        cipher.setAAD(associatedData(pin));
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return Buffer.concat([Buffer.from([version]), iv, cipher.getAuthTag(), ciphertext]);
    } finally {
        plaintext.fill(0);
    }
}

export function inspectSealedAdmissionSnapshot(mount: string, keyPath: string, pin: string) {
    const sealedPath = join(mount, sealedAdmissionSnapshotName);
    const stat = lstatSync(sealedPath);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size <= headerSize || stat.size > maxSealedBytes) {
        throw Error("Invalid sealed admission snapshot.");
    }
    const sealed = readFileSync(sealedPath);
    if (sealed.length <= headerSize || sealed.length > maxSealedBytes || sealed[0] !== version) {
        throw Error("Invalid sealed admission snapshot version or length.");
    }
    const key = readAdmissionKey(keyPath);
    let directory: string | undefined;
    let decrypted: Buffer | undefined;
    let verified: Buffer | undefined;
    const files: Buffer[] = [];
    try {
        const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(1, 13));
        decipher.setAAD(associatedData(pin));
        decipher.setAuthTag(sealed.subarray(13, headerSize));
        decrypted = decipher.update(sealed.subarray(headerSize));
        verified = Buffer.concat([decrypted, decipher.final()]);
        const encoded: unknown = JSON.parse(verified.toString("utf8"));
        if (!Array.isArray(encoded) || encoded.length !== operatorStateFiles.length) throw Error("Invalid admission state set.");
        for (const value of encoded) {
            if (typeof value !== "string") throw Error("Invalid admission state file.");
            const file = Buffer.from(value, "base64");
            files.push(file);
            if (!file.length || file.toString("base64") !== value) throw Error("Invalid admission state file encoding.");
        }
        if (stateSetPin(files) !== pin) throw Error("Unapproved admission state set.");
        directory = mkdtempSync(join(tmpdir(), "pbos-hosted-observation-"));
        for (const [index, name] of operatorStateFiles.entries()) {
            writeFileSync(join(directory, name), files[index], { mode: 0o400, flag: "wx" });
        }
        return inspectExistingOperatorRuntime(directory, pin);
    } finally {
        key.fill(0);
        decrypted?.fill(0);
        verified?.fill(0);
        for (const file of files) file.fill(0);
        if (directory) rmSync(directory, { recursive: true, force: true });
    }
}
