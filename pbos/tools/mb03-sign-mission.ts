import { createHash, createPrivateKey, createPublicKey, randomUUID, sign } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stderr as output } from "node:process";
import {
  hostedApprovalSigningBytes, hostedMissionScopeDigest, planReadyRecoveryDigest, verifyHostedMissionApproval, verifyPlanReadyRecoveryApproval,
  type SignedPlanReadyApproval,
  type SignedHostedMissionApproval, type HostedMissionLineage
} from "../production-runtime/hosted-signed-mission-approval";

import { interruptedPlan } from "../production-runtime/hosted-plan-ready-inspection";

export const MB03_PLAYBOOK_SOURCE_SHA = "b2c2259d67f30ca068f32cd1889542991f294e42";
export const MB03_PLAYBOOK_REPOSITORY = "sgwalton87/playbook-platform";
export const MB03_MISSION_SCOPES = {
  "MB03-MISSION-001": { branch: "pbos/mission-MB03-MISSION-001", path: "docs/pbos-missions/MB03-MISSION-001.md", contentSha256: "bc314aa604692bd5545efe8346b1ad41cbddd97c6aa75a9beae75c98e8b6665f" },
  "MB03-MISSION-002": { branch: "pbos/mission-MB03-MISSION-002", path: "docs/pbos-missions/MB03-MISSION-002.md", contentSha256: "a589864a241ac2d8d35416c317369d2ac350a4f1c254a6d1da0f1af575a2379b" }
} as const;
const SOURCE = "b2c2259d67f30ca068f32cd1889542991f294e42";
const REPOSITORY = MB03_PLAYBOOK_REPOSITORY;
const MISSIONS = MB03_MISSION_SCOPES;

export function makeUnsignedMissionPayload(missionId: keyof typeof MISSIONS, operatorId: string, now = new Date(), nonce = randomUUID()) {
  const scope = MISSIONS[missionId];
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
  return { schema: "pbos.hosted-mission-approval.v1" as const, missionId, repository: REPOSITORY,
    commit: SOURCE, operatorId, scopeDigest: hostedMissionScopeDigest(scope), issuedAt, expiresAt, nonce };
}

export const recoveryPublicationBase = "c556c418ec453a866cbec266922f394edeab6fb6";
export const recoveryKeyFingerprint = "db04246cbc743ba2c75652de473ea3aba8e558f954826dd6e30d8bd0425bcff0";
export const recoveryLineage = Object.freeze({
  missionId: interruptedPlan.missionId, repository: REPOSITORY, commit: SOURCE,
  operatorId: "viveca-walton", scope: MISSIONS["MB03-MISSION-001"]
});

export function recoveryPreview() {
  if (interruptedPlan.commit !== SOURCE || interruptedPlan.repository !== REPOSITORY ||
      hostedMissionScopeDigest(recoveryLineage.scope) !== interruptedPlan.scopeDigest) throw Error("RECOVERY_SCOPE_PIN");
  return { schema: "pbos.hosted-plan-ready-recovery.v1" as const, lineage: recoveryLineage,
    pin: interruptedPlan, publicationBase: recoveryPublicationBase, operatorPublicKeySha256: recoveryKeyFingerprint,
    scopeDigest: planReadyRecoveryDigest(interruptedPlan, recoveryPublicationBase) };
}

function readProtected(path: string, max = 64 * 1024): Buffer {
  const full = resolve(path);
  if (realpathSync(full) !== full) throw Error("Signing file path contains an alias.");
  const fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const meta = fstatSync(fd);
    if (!meta.isFile() || meta.size < 1 || meta.size > max || (meta.mode & 0o077) !== 0 ||
        meta.uid !== process.getuid?.()) throw Error("Signing file ownership, permissions or size failed verification.");
    return readFileSync(fd);
  } finally { closeSync(fd); }
}

export function makeRecoveryPayload(now = new Date(), nonce = randomUUID()): SignedPlanReadyApproval["payload"] {
  const preview = recoveryPreview();
  return { ...makeUnsignedMissionPayload("MB03-MISSION-001", recoveryLineage.operatorId, now, nonce),
    schema: preview.schema, scopeDigest: preview.scopeDigest };
}

export function signRecoveryPayload(payload: SignedPlanReadyApproval["payload"], privatePem: Buffer,
    passphrase: string, publicPem: string, now = new Date()) {
  const privateKey = createPrivateKey({ key: privatePem, format: "pem", passphrase });
  if (privateKey.asymmetricKeyType !== "ed25519") throw Error("Recovery requires an Ed25519 key.");
  const approval = { payload, signatureBase64: sign(null, hostedApprovalSigningBytes(payload), privateKey).toString("base64") };
  const recovery = { pin: interruptedPlan, publicationBase: recoveryPublicationBase, approval };
  if (!verifyPlanReadyRecoveryApproval(recovery, recoveryLineage, publicPem, now)) throw Error("RECOVERY_SIGNATURE_INVALID");
  return recovery;
}

export function signMissionPayload(payload: ReturnType<typeof makeUnsignedMissionPayload>, privatePem: Buffer, passphrase: string, publicPem: string): SignedHostedMissionApproval {
  const privateKey = createPrivateKey({ key: privatePem, format: "pem", passphrase });
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("The custodian key must be Ed25519.");
  const envelope: SignedHostedMissionApproval = { payload, signatureBase64: sign(null, hostedApprovalSigningBytes(payload), privateKey).toString("base64") };
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
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--preview-plan-ready") {
    console.log(JSON.stringify(recoveryPreview(), null, 2));
    return;
  }
  const recovery = args[0] === "--recover-plan-ready";
  if (recovery) args.shift();
  const [missionId, operatorId, privatePath, publicPath] = args;
  if (args.length !== 4 || !Object.hasOwn(MISSIONS, missionId) || !operatorId || !privatePath || !publicPath)
    throw Error("Expected a supported mission, operator ID, private-key path and public-key path.");
  if (recovery && (missionId !== recoveryLineage.missionId || operatorId !== recoveryLineage.operatorId)) throw Error("RECOVERY_OPERATOR_OR_MISSION");
  if (!input.isTTY || !output.isTTY) throw Error("Signing requires the custodian's interactive terminal.");
  const publicPem = readProtected(publicPath).toString("utf8");
  if (recovery) {
    const key = createPublicKey(publicPem);
    if (key.asymmetricKeyType !== "ed25519" ||
        createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex") !== recoveryKeyFingerprint)
      throw Error("RECOVERY_PUBLIC_KEY_PIN");
  }
  const id = missionId as keyof typeof MISSIONS;
  const payload = recovery ? makeRecoveryPayload() : makeUnsignedMissionPayload(id, operatorId);
  console.error(JSON.stringify({ reviewRequired: true, ...MISSIONS[id], ...(recovery ? recoveryPreview() : {}), ...payload }, null, 2));
  const phrase = recovery ? `RECOVER ${interruptedPlan.runId} ${missionId}` : `SIGN ${missionId}`;
  const rl = createInterface({ input, output });
  let confirm: string;
  try { confirm = await rl.question(`Type ${phrase} to continue: `); } finally { rl.close(); }
  if (confirm !== phrase) throw Error("Signing cancelled.");
  const passphrase = await hidden("Private-key passphrase (hidden): ");
  const privatePem = readProtected(privatePath);
  try {
    const signed = payload.schema === "pbos.hosted-plan-ready-recovery.v1"
      ? signRecoveryPayload(payload, privatePem, passphrase, publicPem)
      : signMissionPayload(payload, privatePem, passphrase, publicPem);
    console.log(JSON.stringify(signed));
  } finally { privatePem.fill(0); }
}

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Signing failed."); process.exitCode = 1; });
