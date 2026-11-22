import { describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync } from "node:crypto";
import { checkpointSealer, requireHostedExecutorEnvironment, verifyGoogleWorkloadIdentity, verifyHostedOperatorKey } from "../pbos/tools/mb03-hosted-executor";

describe("MB03 hosted executable configuration", () => {
  const complete = {
    PBOS_DATABASE_URL:"postgresql://runner:test@db.invalid/pbos?sslmode=require",
    PBOS_STATE_FILE:"/var/lib/pbos/genesis-state.json", PBOS_STATE_NAMESPACE:"mb03-hosted",
    PBOS_PPS_DIRECTORY:"/var/lib/pbos/pps", PBOS_PPS_MANIFEST_SHA256:"a".repeat(64),
    PBOS_APPROVAL_PUBLIC_KEY_FILE:"/var/run/secrets/approval.pem",
    PBOS_APPROVAL_PUBLIC_KEY_SHA256:"b".repeat(64),
    PBOS_GITHUB_APP_INSTALLATION_TOKEN:"short-lived", PBOS_CHECKPOINT_KEY_BASE64:Buffer.alloc(32,7).toString("base64"),
    PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT:"pbos-genesis-executor@pbos-genesis-staging.iam.gserviceaccount.com",
    PBOS_MISSION_INPUT_FILE:"/var/run/pbos/mission.json"
  };
  it("fails closed when any credential or authority binding is missing", () => {
    for (const key of Object.keys(complete)) {
      expect(() => requireHostedExecutorEnvironment({...complete,[key]:""})).toThrow(key);
    }
  });
  it("requires the independently pinned Ed25519 public key and rejects private material", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const fingerprint = createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex");
    expect(verifyHostedOperatorKey(pem, fingerprint)).toBe(pem.trim());
    expect(() => verifyHostedOperatorKey(pem, "0".repeat(64))).toThrow("approved fingerprint");
    expect(() => verifyHostedOperatorKey(privateKey.export({ type: "pkcs8", format: "pem" }).toString(), fingerprint))
      .toThrow("public key only");
  });
  it("requires the exact Cloud Run job and metadata-attested service account", async () => {
    const headers = new Headers({"metadata-flavor":"Google"});
    const fetcher = vi.fn(async () => new Response(complete.PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT,{status:200,headers}));
    await expect(verifyGoogleWorkloadIdentity(complete.PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT,fetcher as typeof fetch,
      {CLOUD_RUN_JOB:"wrong"})).resolves.toBe(false);
    await expect(verifyGoogleWorkloadIdentity(complete.PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT,fetcher as typeof fetch,
      {CLOUD_RUN_JOB:"pbos-genesis-admission"})).resolves.toBe(true);
    await expect(verifyGoogleWorkloadIdentity("other@pbos-genesis-staging.iam.gserviceaccount.com",fetcher as typeof fetch,
      {CLOUD_RUN_JOB:"pbos-genesis-admission"})).resolves.toBe(false);
  });
  it("seals checkpoints with randomized authenticated ciphertext", async () => {
    const seal=checkpointSealer(complete.PBOS_CHECKPOINT_KEY_BASE64);
    const first=await seal(Buffer.from("checkpoint"));
    const second=await seal(Buffer.from("checkpoint"));
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false);
    expect(first[0]).toBe(1);
    expect(first.toString()).not.toContain("checkpoint");
    expect(()=>checkpointSealer("invalid")).toThrow("256-bit");
  });
});
