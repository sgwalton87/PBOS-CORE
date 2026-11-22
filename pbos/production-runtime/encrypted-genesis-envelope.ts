import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypted Genesis envelope for private cloud persistence.
 * The 32-byte key must come from a managed server-side secret, never GitHub or a browser.
 * AES-256-GCM authenticates ciphertext; associated data binds it to the Genesis record.
 */
const MAGIC = Buffer.from("PBOSG1", "ascii");
const AAD = Buffer.from("pbos_runner.canonical_state:genesis:v1", "utf8");
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function keyFromHex(keyHex: string): Buffer {
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) throw new Error("PBOS Genesis encryption key must be 32 bytes");
  return Buffer.from(keyHex, "hex");
}

export interface EncryptedGenesis {
  readonly ciphertext: Uint8Array;
  readonly plaintextSha256: string;
}

export function encryptCanonicalGenesis(plaintext: Uint8Array, keyHex: string): EncryptedGenesis {
  const key = keyFromHex(keyHex);
  if (!plaintext.length) throw new Error("Refusing to encrypt empty Genesis");
  const parsed: unknown = JSON.parse(Buffer.from(plaintext).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid Genesis JSON");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(AAD);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), body]),
    plaintextSha256: createHash("sha256").update(plaintext).digest("hex")
  };
}

export function decryptCanonicalGenesis(envelope: Uint8Array, keyHex: string, expectedSha256: string): Uint8Array {
  const key = keyFromHex(keyHex);
  if (!/^[a-fA-F0-9]{64}$/.test(expectedSha256)) throw new Error("Expected Genesis fingerprint required");
  const bytes = Buffer.from(envelope);
  const prefix = MAGIC.length;
  if (bytes.length <= prefix + NONCE_BYTES + TAG_BYTES || !bytes.subarray(0, prefix).equals(MAGIC)) {
    throw new Error("Invalid PBOS Genesis encrypted envelope");
  }
  const nonce = bytes.subarray(prefix, prefix + NONCE_BYTES);
  const tag = bytes.subarray(prefix + NONCE_BYTES, prefix + NONCE_BYTES + TAG_BYTES);
  const body = bytes.subarray(prefix + NONCE_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  const actual = createHash("sha256").update(plaintext).digest("hex");
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) throw new Error("Genesis fingerprint mismatch");
  JSON.parse(plaintext.toString("utf8"));
  return plaintext;
}
