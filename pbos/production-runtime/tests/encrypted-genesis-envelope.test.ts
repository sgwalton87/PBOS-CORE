import { describe, expect, it } from "vitest";
import { encryptCanonicalGenesis, decryptCanonicalGenesis } from "../encrypted-genesis-envelope";

const key = "1".repeat(64);
const otherKey = "2".repeat(64);
const state = Buffer.from(JSON.stringify({ systems: [{systemId:"test"}], grants:[], audit:[] }));
describe("authenticated encrypted Genesis state", () => {
  it("round-trips original bytes and fingerprint", () => {
    const saved = encryptCanonicalGenesis(state, key);
    expect(Buffer.from(decryptCanonicalGenesis(saved.ciphertext,key,saved.plaintextSha256))).toEqual(state);
  });
  it("uses a fresh nonce for each encryption", () => {
    const a = encryptCanonicalGenesis(state,key);
    const b = encryptCanonicalGenesis(state,key);
    expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(false);
    expect(a.plaintextSha256).toBe(b.plaintextSha256);
  });
  it("rejects incorrect key, modified ciphertext and wrong fingerprint", () => {
    const saved = encryptCanonicalGenesis(state,key);
    expect(() => decryptCanonicalGenesis(saved.ciphertext,otherKey,saved.plaintextSha256)).toThrow();
    const tampered = Buffer.from(saved.ciphertext);
    tampered[tampered.length-1] ^= 1;
    expect(() => decryptCanonicalGenesis(tampered,key,saved.plaintextSha256)).toThrow();
    expect(() => decryptCanonicalGenesis(saved.ciphertext,key,"0".repeat(64))).toThrow("fingerprint mismatch");
  });
  it("rejects invalid state and invalid key", () => {
    expect(() => encryptCanonicalGenesis(Buffer.from("not json"),key)).toThrow();
    expect(() => encryptCanonicalGenesis(state,"weak")).toThrow();
  });
});
