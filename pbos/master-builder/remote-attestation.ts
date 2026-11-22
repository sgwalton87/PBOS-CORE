import { createHash, createPublicKey, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";

export interface SignedRemoteEvidence<T> {
    readonly payload: T;
    readonly signature: string;
}

export function evidenceJson(value: unknown): string {
    return JSON.stringify(value, (_key, item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
    });
}

export const evidenceDigest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export const evidenceSha256 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const evidenceGitSha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);

export function evidenceSignatureInput(domain: string, payload: unknown): Buffer {
    return Buffer.from(evidenceJson([domain, payload]));
}

export function requireRemoteSignature<T>(domain: string, signed: SignedRemoteEvidence<T>, trustedKey: KeyObject): T {
    const { payload, signature } = signed;
    if (trustedKey.type !== "public" || trustedKey.asymmetricKeyType !== "ed25519" ||
        typeof signature !== "string" || !/^[a-f0-9]{128}$/.test(signature) ||
        !verify(null, evidenceSignatureInput(domain, payload), trustedKey, Buffer.from(signature, "hex"))) {
        throw new Error("Remote attestation signature rejected.");
    }
    return payload;
}

export function remoteKeyFingerprint(key: KeyObject): string {
    return evidenceDigest((key.type === "public" ? key : createPublicKey(key)).export({ format: "der", type: "spki" }));
}
