import { createPrivateKey, createPublicKey, randomUUID, sign } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  hostedMissionScopeDigest, verifyHostedMissionApproval,
  type SignedHostedMissionApproval, type HostedMissionLineage
} from "../production-runtime/hosted-signed-mission-approval";

export const MB03_PLAYBOOK_SOURCE_SHA = "6bfa55c69f50b8872f8509a2e8f4e1fe8e415fea";
export const MB03_PLAYBOOK_REPOSITORY = "sgwalton87/playbook-platform";
export const MB03_MISSION_SCOPES = {
  "MB03-MISSION-001": { branch: "pbos/mission-MB03-MISSION-001", path: "docs/pbos-missions/MB03-MISSION-001.md", contentSha256: "f47d3b241663ccf0f1a60ce7e5df7344ed246babd34fe96bca8105dea9910746" },
  "MB03-MISSION-002": { branch: "pbos/mission-MB03-MISSION-002", path: "docs/pbos-missions/MB03-MISSION-002.md", contentSha256: "4b48dca4e087a6355b1621639eb35c8722af91844067a9493783f6b2207bbaad" }
} as const;
const SOURCE = MB03_PLAYBOOK_SOURCE_SHA;
const REPOSITORY = MB03_PLAYBOOK_REPOSITORY;
const MISSIONS = MB03_MISSION_SCOPES;

export function makeUnsignedMissionPayload(missionId: keyof typeof MISSIONS, operatorId: string, now = new Date(), nonce = randomUUID()) {
  const scope = MISSIONS[missionId];
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
  return { schema: "pbos.hosted-mission-approval.v1" as const, missionId, repository: REPOSITORY,
    commit: SOURCE, operatorId, scopeDigest: hostedMissionScopeDigest(scope), issuedAt, expiresAt, nonce };
}

function canonical(payload: ReturnType<typeof makeUnsignedMissionPayload>): Buffer {
  return Buffer.from(JSON.stringify([payload.schema, payload.missionId, payload.repository, payload.commit,
    payload.operatorId, payload.scopeDigest, payload.issuedAt, payload.expiresAt, payload.nonce]), "utf8");
}

function readProtected(path: string, max = 64 * 1024): Buffer {
  const full = resolve(path), meta = lstatSync(full), parent = dirname(full);
  if (!meta.isFile() || meta.isSymbolicLink() || meta.size < 1 || meta.size > max ||
      (meta.mode & 0o077) !== 0 || resolve(parent) !== parent) throw new Error("Signing key path must be a private, non-symlink file with mode 0600 or stricter.");
  return readFileSync(full);
}

export function signMissionPayload(payload: ReturnType<typeof makeUnsignedMissionPayload>, privatePem: Buffer, passphrase: string, publicPem: string): SignedHostedMissionApproval {
  const privateKey = createPrivateKey({ key: privatePem, format: "pem", passphrase });
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("The custodian key must be Ed25519.");
  const envelope: SignedHostedMissionApproval = { payload, signatureBase64: sign(null, canonical(payload), privateKey).toString("base64") };
  const expected: HostedMissionLineage = { missionId: payload.missionId, repository: REPOSITORY, commit: SOURCE, operatorId: payload.operatorId,
    scope: MISSIONS[payload.missionId as keyof typeof MISSIONS] };
  if (!verifyHostedMissionApproval(envelope, expected, publicPem, new Date(Date.parse(payload.issuedAt) + 1000))) throw new Error("Generated signature failed independent verification.");
  return envelope;
}

async function hidden(prompt: string): Promise<string> {
  output.write(prompt); const chars: string[] = [];
  input.setRawMode?.(true); input.resume();
  return await new Promise(resolvePromise => {
    const onData = (chunk: Buffer) => { const value = chunk.toString(); if (value === "\r" || value === "\n") { input.setRawMode?.(false); input.pause(); input.off("data", onData); output.write("\n"); resolvePromise(chars.join("")); } else if (value === "\u0003") process.exit(130); else if (value === "\u007f") chars.pop(); else chars.push(value); };
    input.on("data", onData);
  });
}

async function main(): Promise<void> {
  const [missionId, operatorId, privatePath, publicPath] = process.argv.slice(2);
  if (!(missionId in MISSIONS) || !operatorId || !privatePath || !publicPath) throw new Error("Usage: mb03-sign-mission <mission-id> <operator-id> <private-key.pem> <public-key.pem>");
  const mission = MISSIONS[missionId as keyof typeof MISSIONS];
  const payload = makeUnsignedMissionPayload(missionId as keyof typeof MISSIONS, operatorId);
  console.log(JSON.stringify({ reviewRequired: true, missionId, repository: REPOSITORY, commit: SOURCE, branch: mission.branch, path: mission.path, contentSha256: mission.contentSha256, scopeDigest: payload.scopeDigest, issuedAt: payload.issuedAt, expiresAt: payload.expiresAt }, null, 2));
  const rl = createInterface({ input, output });
  const confirm = await rl.question(`Type SIGN ${missionId} to continue: `); rl.close();
  if (confirm !== `SIGN ${missionId}`) throw new Error("Signing cancelled.");
  const passphrase = await hidden("Private-key passphrase (hidden): ");
  const publicPem = readProtected(publicPath).toString("utf8");
  const envelope = signMissionPayload(payload, readProtected(privatePath), passphrase, publicPem);
  console.log(JSON.stringify(envelope));
}

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Signing failed."); process.exitCode = 1; });
