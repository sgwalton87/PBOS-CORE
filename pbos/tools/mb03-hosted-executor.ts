/**
 * Hosted Playbook draft-PR command. This is the mutation boundary: it requires an
 * exact signed mission envelope, private canonical state, verified PPS Canon,
 * Google workload identity, durable Neon fencing, and a scoped GitHub App token.
 */
import { createCipheriv, createHash, createPublicKey, randomBytes } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { GenesisStateRepository } from "../genesis-state";
import { verifyPpsCanon } from "../boot/pps-canon-snapshot-verifier";
import { ProductionMissionRunner } from "../production-runtime/production-mission-runner";
import { ProductionRuntimeService } from "../production-runtime/production-runtime-service";
import { composeHostedNeonExecutor } from "../production-runtime/hosted-neon-executor-composition";
import { GitHubAppPlaybookPrApi } from "../production-runtime/github-app-playbook-pr-api";
import { executeHostedPlaybookMission, type HostedPlaybookMissionInput } from "../production-runtime/hosted-playbook-mission-executable";
import type { NeonLeaseSql } from "../production-runtime/neon-fenced-lease-provider";

const REQUIRED = [
  "PBOS_DATABASE_URL", "PBOS_STATE_FILE", "PBOS_STATE_NAMESPACE", "PBOS_PPS_DIRECTORY", "PBOS_PPS_MANIFEST_SHA256",
  "PBOS_APPROVAL_PUBLIC_KEY_FILE", "PBOS_APPROVAL_PUBLIC_KEY_SHA256", "PBOS_GITHUB_APP_INSTALLATION_TOKEN",
  "PBOS_CHECKPOINT_KEY_BASE64", "PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT", "PBOS_MISSION_INPUT_FILE"
] as const;

export type HostedExecutorEnvironment = Record<(typeof REQUIRED)[number], string>;

export function requireHostedExecutorEnvironment(env: NodeJS.ProcessEnv): HostedExecutorEnvironment {
  const missing = REQUIRED.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error(`Hosted executor configuration missing: ${missing.join(", ")}`);
  const config = Object.fromEntries(REQUIRED.map(name => [name, env[name]!.trim()])) as HostedExecutorEnvironment;
  if (!/^[a-f0-9]{64}$/.test(config.PBOS_PPS_MANIFEST_SHA256)) {
    throw new Error("Invalid PBOS_PPS_MANIFEST_SHA256.");
  }
  if (!/^[a-f0-9]{64}$/.test(config.PBOS_APPROVAL_PUBLIC_KEY_SHA256)) {
    throw new Error("Invalid PBOS_APPROVAL_PUBLIC_KEY_SHA256.");
  }
  return config;
}

export function verifyHostedOperatorKey(pem: string, expectedSha256: string): string {
  const publicPem = pem.trim();
  if (!/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----$/.test(publicPem)) {
    throw new Error("Hosted operator verification requires an SPKI public key only.");
  }
  const key = createPublicKey(publicPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Hosted operator key must be Ed25519.");
  const spki = key.export({ type: "spki", format: "der" });
  if (createHash("sha256").update(spki).digest("hex") !== expectedSha256) {
    throw new Error("Hosted operator key does not match the approved fingerprint.");
  }
  return publicPem;
}

async function readBoundedFile(path: string, maximumBytes: number): Promise<Buffer> {
  const canonical = resolve(path);
  const [actual, stat] = await Promise.all([realpath(canonical), lstat(canonical)]);
  if (actual !== canonical || !stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maximumBytes) {
    throw new Error("Hosted executor input file is missing, unsafe, or exceeds its bound.");
  }
  return readFile(canonical);
}

export async function verifyGoogleWorkloadIdentity(
  expectedServiceAccount: string,
  request: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  if (env.CLOUD_RUN_JOB !== "pbos-genesis-admission" || !expectedServiceAccount.endsWith(".iam.gserviceaccount.com")) return false;
  try {
    const response = await request(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3000) }
    );
    if (!response.ok || response.headers.get("metadata-flavor") !== "Google") return false;
    return (await response.text()).trim() === expectedServiceAccount;
  } catch { return false; }
}

export function checkpointSealer(keyBase64: string): (plaintext: Uint8Array) => Promise<Uint8Array> {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32 || key.toString("base64") !== keyBase64) throw new Error("Checkpoint encryption key must be canonical 256-bit base64.");
  return async plaintext => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]);
  };
}

export async function runHostedExecutor(env: NodeJS.ProcessEnv = process.env): Promise<Readonly<Record<string, unknown>>> {
  const config = requireHostedExecutorEnvironment(env);
  const [publicKey, inputBytes] = await Promise.all([
    readBoundedFile(config.PBOS_APPROVAL_PUBLIC_KEY_FILE, 16_384),
    readBoundedFile(config.PBOS_MISSION_INPUT_FILE, 128 * 1024)
  ]);
  const trustedPublicKeyPem = verifyHostedOperatorKey(publicKey.toString("utf8"), config.PBOS_APPROVAL_PUBLIC_KEY_SHA256);
  const input = JSON.parse(inputBytes.toString("utf8")) as HostedPlaybookMissionInput;
  const state = new GenesisStateRepository(config.PBOS_STATE_FILE, config.PBOS_STATE_NAMESPACE);
  const runtime = new ProductionRuntimeService(state);
  const sql = neon(config.PBOS_DATABASE_URL, { fullResults: true });
  const db: NeonLeaseSql = {
    async query<T extends Record<string, unknown>>(query: string, params: readonly unknown[]) {
      const result = await sql.query(query, [...params]);
      return { rows: result.rows as T[] };
    }
  };
  const composed = composeHostedNeonExecutor(db, {
    trustedPublicKeyPem,
    verifyConstitution: async () => {
      const [integrity, pps] = await Promise.all([
        Promise.resolve(runtime.verifyIntegrity()), verifyPpsCanon(config.PBOS_PPS_DIRECTORY, config.PBOS_PPS_MANIFEST_SHA256)
      ]);
      return integrity.valid && pps.valid;
    },
    verifyWorkloadIdentity: () => verifyGoogleWorkloadIdentity(config.PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT, fetch, env)
  });
  const result = await executeHostedPlaybookMission(input, {
    runner: new ProductionMissionRunner(state, runtime), admission: composed.dependencies,
    checkpoints: composed.checkpoints,
    github: new GitHubAppPlaybookPrApi(config.PBOS_GITHUB_APP_INSTALLATION_TOKEN),
    sealCheckpoint: checkpointSealer(config.PBOS_CHECKPOINT_KEY_BASE64)
  });
  return {
    schema: "pbos.hosted-mission-result.v1",
    executionKind: "BOUNDED_DRAFT_PR",
    stopReason: result.stopReason,
    runs: result.runs.map(run => ({runId:run.runId,status:run.status,currentCommit:run.currentCommit,evidenceIds:run.evidenceIds}))
  };
}

if (require.main === module) {
  runHostedExecutor().then(result => process.stdout.write(JSON.stringify(result) + "\n")).catch(error => {
    process.stderr.write(JSON.stringify({
      schema: "pbos.hosted-mission-error.v1",
      error: error instanceof Error ? error.message : "Hosted executor failed."
    }) + "\n");
    process.exitCode = 1;
  });
}
