#!/usr/bin/env node
// MB-03 configuration parity inspection ONLY. No Google calls, writes, signatures or dispatch.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const READINESS = "pbos-mb03-playbook-readiness";
export const SIGNED = "pbos-mb03-playbook-codex";
export const SERVICE_ACCOUNT = "pbos-mb03-playbook-codex@pbos-genesis-staging.iam.gserviceaccount.com";
export const APPROVED_IMAGE =
  "us-west1-docker.pkg.dev/pbos-genesis-staging/pbos-executor/mb03-playbook-controller@sha256:95161c3080111b6beca1debd3ec251700413940ab1164c4325aee5455bd859e2";
export const APPROVED_SOURCE = "6bfa55c69f50b8872f8509a2e8f4e1fe8e415fea";
export const APPROVED_STATE_PIN = "2f48068fc89fd278cf4f932ac4ea3cd9ec4e9e2990a330cf78d7551b33ccb47d";
export const APPROVED_PPS_PIN = "54fc93d82f5b5b39584776b3b92ba3949f927425d3ee05505803d63b9957b68b";
export const APPROVED_PLAYBOOK_IMAGE =
  "vcr.vercel.com/pbos-genesis/the-playbook/pbos-mb03-playbook-worker@sha256:16f0f932bf78ae440ba00f5e1541bfa056740fe6b7013886e1bc1131f5572e95";
export const APPROVED_CODEX_DIGEST = "b76a027d6b210f9a8da7aaf321dd235c700f0ef7a794d4a5314b9af6c134f0f0";
export const GCS_VOLUMES = Object.freeze({
  "execution-state": Object.freeze({ bucket: "pbos-genesis-staging-mb03-execution-state", prefix:"synthetic" }),
  "observation-state": Object.freeze({ bucket: "pbos-genesis-staging-mb03-observation-state", prefix:"mb03-admission/" + APPROVED_STATE_PIN }),
  "pps-canon": Object.freeze({ bucket:"pbos-genesis-staging-mb03-pps", prefix:"PPS" })
});
export const ENTRYPOINT = "/usr/local/bin/mb03-stage-secrets";
export const EXECUTABLE = "./node_modules/.bin/tsx";
export const CONTROLLER = "pbos/tools/mb03-protected-playbook-codex.ts";

function config(doc, errors, scope) {
  const spec = doc?.spec?.template?.spec?.template?.spec ??
               doc?.template?.template ??
               doc?.template;
  const container = spec?.containers?.[0];
  if (!spec || !container || !Array.isArray(spec?.containers) || spec.containers.length !== 1) {
    errors.push(scope + "_STRUCTURE_UNRECOGNIZED");
    return null;
  }
  const env = new Map((container.env || []).map(e => [e.name, e]));
  const mounts = new Map((container.volumeMounts || []).map(m => [m.name, m]));
  const volumes = new Map((spec.volumes || []).map(v => [v.name, v]));
  return { doc, spec, container, env, mounts, volumes };
}
function value(c, field) { return c.env.get(field)?.value; }
function same(actual, expected, reason, errors) {
  if (actual !== expected) errors.push(reason);
}
function mount(c, name, path, errors, scope) {
  same(c.mounts.get(name)?.mountPath, path, scope + "_" + name.toUpperCase().replace(/-/g,"_") + "_MOUNT", errors);
}
function validateGcs(c,name,errors,scope) {
  const volume=c.volumes.get(name)?.csi;
  const expected=GCS_VOLUMES[name];
  if (!expected || !volume || volume.driver !== "gcsfuse.run.googleapis.com") {
    errors.push(scope + "_" + name.toUpperCase().replace(/-/g,"_") + "_CSI_DRIVER"); return;
  }
  const code=scope + "_" + name.toUpperCase().replace(/-/g,"_");
  same(volume.volumeAttributes?.bucketName, expected.bucket, code + "_BUCKET", errors);
  const raw=volume.volumeAttributes?.mountOptions;
  const attrs=typeof raw === "string" ? raw.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : [];
  const opts=new Map(attrs.map(t=>{const p=t.indexOf("=");return [t.slice(0,p),t.slice(p+1)];}));
  for(const [key,val] of [["only-dir",expected.prefix],["uid","1000"],["gid","1000"],["file-mode","400"],["dir-mode","500"]]){
    const actual=opts.get(key);
    const normalized = key==="file-mode" || key==="dir-mode"
      ? (/^0*[0-9]+$/.test(actual ?? "") ? String(Number(actual)) : actual)
      : actual;
    same(normalized, val, code + "_OPTION_" + key.toUpperCase().replace(/-/g,"_"), errors);
  }
}
function item(c, name, secretName, path, errors, scope) {
  const s = c.volumes.get(name)?.secret;
  if (s?.secretName !== secretName ||
      !s.items?.some(i => i.path === path && String(i.key) === "1")) {
    errors.push(scope + "_" + name.toUpperCase().replace(/-/g,"_") + "_SECRET_BINDING");
  }
}
export function audit(readiness, signed) {
  const errors = [];
  const r = config(readiness, errors, "READINESS");
  const s = config(signed, errors, "SIGNED");
  if (!r || !s) return { status: "BLOCKED", checks: "CONFIG_PARITY_ONLY", findings: errors.sort() };

  same(readiness.metadata?.name, READINESS, "READINESS_JOB_NAME", errors);
  same(signed.metadata?.name, SIGNED, "SIGNED_JOB_NAME", errors);
  same(r.spec.serviceAccountName, SERVICE_ACCOUNT, "READINESS_SERVICE_ACCOUNT", errors);
  same(s.spec.serviceAccountName, SERVICE_ACCOUNT, "SIGNED_SERVICE_ACCOUNT", errors);
  same(r.spec.maxRetries, 0, "READINESS_RETRIES", errors);
  same(s.spec.maxRetries, 0, "SIGNED_RETRIES", errors);
  same(r.container.image, APPROVED_IMAGE, "READINESS_PINNED_IMAGE", errors);
  same(s.container.image, APPROVED_IMAGE, "SIGNED_IMAGE_NOT_READINESS_PIN", errors);
  same(r.container.command?.join(" "), ENTRYPOINT, "READINESS_ENTRYPOINT", errors);
  same(s.container.command?.join(" "), ENTRYPOINT, "SIGNED_ENTRYPOINT", errors);
  same(r.container.args?.join(" "), [EXECUTABLE, CONTROLLER, "--verify-bindings"].join(" "), "READINESS_ARGUMENTS", errors);
  same(s.container.args?.join(" "), [EXECUTABLE, CONTROLLER].join(" "), "SIGNED_ARGUMENTS", errors);
  same(value(r, "PBOS_MISSION_EXECUTION_APPROVED"), "false", "READINESS_EXECUTION_ENABLED", errors);
  same(value(s, "PBOS_MISSION_EXECUTION_APPROVED"), "true", "SIGNED_EXECUTION_FLAG", errors);
  same(value(r, "PBOS_PLAYBOOK_SOURCE_SHA"), APPROVED_SOURCE, "READINESS_SOURCE_PIN", errors);
  same(value(s, "PBOS_PLAYBOOK_SOURCE_SHA"), APPROVED_SOURCE, "SIGNED_SOURCE_PIN", errors);

  for (const [field, path] of [
    ["PBOS_OBSERVATION_KEY_FILE", "/var/lib/pbos-private/observation-key"],
    ["PBOS_APPROVAL_PUBLIC_KEY_FILE", "/var/lib/pbos-private/operator-public.pem"],
    ["PBOS_PROVIDER_PUBLIC_KEY_FILE", "/var/lib/pbos-private/provider-public.pem"]
  ]) {
    same(value(r, field), path, "READINESS_" + field + "_PATH", errors);
    same(value(s, field), path, "SIGNED_" + field + "_PATH", errors);
  }
  same(value(s, "PBOS_PROVIDER_SIGNING_KEY_FILE"), "/var/lib/pbos-private/provider-private.pem", "SIGNED_PRIVATE_SIGNER_PATH", errors);
  if (r.env.has("PBOS_PROVIDER_SIGNING_KEY_FILE") || r.env.has("PBOS_PROVIDER_SIGNING_KEY_PEM") ||
      r.mounts.has("provider-signing-key") || r.volumes.has("provider-signing-key")) {
    errors.push("READINESS_CONTAINS_PRIVATE_SIGNER");
  }
  if (s.env.has("PBOS_PROVIDER_SIGNING_KEY_PEM")) errors.push("SIGNED_HAS_DUPLICATE_ENV_PRIVATE_SIGNER");
  if (r.env.has("PBOS_VERCEL_SANDBOX_TOKEN") || r.env.has("PBOS_MODEL_ADMIN_CREDENTIAL")) {
    errors.push("READINESS_HAS_EXECUTION_CREDENTIALS");
  }
  if (!s.env.get("PBOS_VERCEL_SANDBOX_TOKEN")?.valueFrom?.secretKeyRef) errors.push("SIGNED_SANDBOX_TOKEN_REFERENCE");
  if (!s.env.get("PBOS_MODEL_ADMIN_CREDENTIAL")?.valueFrom?.secretKeyRef) errors.push("SIGNED_MODEL_ADMIN_REFERENCE");
  if (!s.env.get("PBOS_CHECKPOINT_KEY_BASE64")?.valueFrom?.secretKeyRef) errors.push("SIGNED_CHECKPOINT_REFERENCE");
  if (value(s, "PBOS_MISSION_INPUT_FILE") !== "/var/lib/pbos-missions/mission.json") errors.push("SIGNED_MISSION_INPUT_PATH");

  for (const [name,path,secretName,itemPath] of [
    ["operator-public-key", "/var/run/secrets/mb03/operator", "mb03-operator-public-key", "public.pem"],
    ["provider-public-key", "/var/run/secrets/mb03/provider-public", "mb03-provider-public-key", "public.pem"],
    ["observation-key", "/var/run/secrets/mb03/observation", "mb03-observation-seal-key", "key"]
  ]) {
    for (const [scope,c] of [["READINESS",r],["SIGNED",s]]) {
      mount(c, name, path, errors, scope);
      item(c, name, secretName, itemPath, errors, scope);
    }
  }
  mount(s, "provider-signing-key", "/var/run/secrets/mb03/provider", errors, "SIGNED");
  item(s, "provider-signing-key", "mb03-provider-signing-key", "private.pem", errors, "SIGNED");

  for (const [scope,c,expectStateWritable] of [["READINESS",r,false],["SIGNED",s,true]]) {
    mount(c, "execution-state", "/var/lib/pbos-missions", errors, scope);
    mount(c, "observation-state", "/var/lib/pbos-observation", errors, scope);
    mount(c, "pps-canon", "/var/run/pbos-canon", errors, scope);
    same(c.volumes.get("execution-state")?.csi?.readOnly, !expectStateWritable, scope + "_STATE_RW_POLICY", errors);
    same(c.volumes.get("observation-state")?.csi?.readOnly, true, scope + "_OBSERVATION_READONLY", errors);
    same(c.volumes.get("pps-canon")?.csi?.readOnly, true, scope + "_PPS_READONLY", errors);
    for(const name of Object.keys(GCS_VOLUMES)) validateGcs(c,name,errors,scope);
    same(value(c, "PBOS_EXPECTED_STATE_SET_SHA256"), APPROVED_STATE_PIN, scope + "_STATE_PIN", errors);
    same(value(c, "PBOS_PPS_MANIFEST_SHA256"), APPROVED_PPS_PIN, scope + "_PPS_PIN", errors);
    same(value(c, "PBOS_PLAYBOOK_IMAGE"), APPROVED_PLAYBOOK_IMAGE, scope + "_WORKER_IMAGE_PIN", errors);
    same(value(c, "PBOS_CODEX_BINARY_SHA256"), APPROVED_CODEX_DIGEST, scope + "_CODEX_BINARY_PIN", errors);
    same(value(c, "PBOS_APPROVAL_PUBLIC_KEY_SHA256"), "db04246cbc743ba2c75652de473ea3aba8e558f954826dd6e30d8bd0425bcff0", scope + "_OPERATOR_KEY_PIN", errors);
    same(value(c, "PBOS_PROVIDER_PUBLIC_KEY_SHA256"), "e4a807a070776cc37dae41c597a24d88a19c5a5d77feae187d57fec37e83345d", scope + "_PROVIDER_KEY_PIN", errors);
    same(value(c, "PBOS_DISPOSABLE_AUTHORITY_ID"), "84464dfd-2ada-4292-a15b-99d3fa5f28e2", scope + "_DISPOSABLE_AUTHORITY", errors);
    same(value(c, "PBOS_STATE_NAMESPACE"), "mb03-stage4-synthetic-20261124", scope + "_STATE_NAMESPACE", errors);
    same(value(c, "PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT"), SERVICE_ACCOUNT, scope + "_ATTESTED_ACCOUNT", errors);
  }
  return { status: errors.length ? "BLOCKED" : "PARITY_VERIFIED", checks: "CONFIG_PARITY_ONLY", findings: [...new Set(errors)].sort(),
    missionExecuted: false, signedApprovalVerified: false, executionAttempted: false };
}
function main() {
  if (process.argv.length !== 4) {
    console.log(JSON.stringify({status:"BLOCKED",checks:"CONFIG_PARITY_ONLY",findings:["INPUTS_REQUIRED"]}));
    process.exitCode = 2;
    return;
  }
  try {
    const r = JSON.parse(readFileSync(process.argv[2], "utf8"));
    const s = JSON.parse(readFileSync(process.argv[3], "utf8"));
    const report = audit(r,s);
    console.log(JSON.stringify(report));
    if (report.status !== "PARITY_VERIFIED") process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({status:"BLOCKED",checks:"CONFIG_PARITY_ONLY",findings:["INPUTS_INVALID_OR_UNREADABLE"]}));
    process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
