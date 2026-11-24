#!/usr/bin/env node
// MB-03 read-only execution-image forensic check: never deploy, execute, sign or log env values.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MISSION_JOB = "pbos-mb03-playbook-codex";
export const INCIDENT_EXECUTION = "pbos-mb03-playbook-codex-s7mkp";
const PINNED = /@sha256:[a-f0-9]{64}$/;
const enumResult = (code) => code; // All findings are literal, allowlisted constants.

function containerImage(doc, kind) {
  const base = kind === "job"
    ? [
      doc?.spec?.template?.spec?.template?.spec,
      doc?.template?.template,
      doc?.template
    ] : [
      doc?.template, // Cloud Run v2 execution TaskTemplate
      doc?.spec?.template?.spec, // Cloud Run v1 ExecutionSpec -> TaskSpec
      doc?.spec?.template?.spec?.template?.spec
    ];
  const valid = base.filter(s => Array.isArray(s?.containers) && s.containers.length === 1);
  return valid.length === 1 && typeof valid[0].containers[0]?.image === "string"
    ? valid[0].containers[0].image : null;
}
function shortName(full) {
  return typeof full === "string" ? full.split("/").at(-1) : null;
}
export function inspectFailedExecution(job, execution) {
  const findings = [];
  const jobName = shortName(job?.metadata?.name || job?.name);
  const executionName = shortName(execution?.metadata?.name || execution?.name);
  if (jobName !== MISSION_JOB) findings.push(enumResult("SIGNED_JOB_IDENTITY_MISMATCH"));
  if (executionName !== INCIDENT_EXECUTION) findings.push(enumResult("INCIDENT_EXECUTION_IDENTITY_MISMATCH"));
  if (typeof execution?.job === "string" && shortName(execution.job) !== MISSION_JOB) {
    findings.push(enumResult("EXECUTION_PARENT_JOB_MISMATCH"));
  }
  const jobImage = containerImage(job,"job");
  const executionImage = containerImage(execution,"execution");
  if (!jobImage) findings.push(enumResult("SIGNED_JOB_IMAGE_UNREADABLE"));
  if (!executionImage) findings.push(enumResult("INCIDENT_EXECUTION_IMAGE_UNREADABLE"));
  if (jobImage && !PINNED.test(jobImage)) findings.push(enumResult("SIGNED_JOB_IMAGE_NOT_DIGEST_PINNED"));
  if (executionImage && !PINNED.test(executionImage)) findings.push(enumResult("INCIDENT_IMAGE_NOT_DIGEST_PINNED"));
  if (jobImage && executionImage && jobImage !== executionImage) {
    findings.push(enumResult("INCIDENT_EXECUTION_IMAGE_DIFFERS_FROM_CURRENT_JOB"));
  }
  const generation = job?.metadata?.generation ?? job?.generation;
  const observed = job?.status?.observedGeneration ?? job?.observedGeneration;
  // Both values must exist and be positive integers. Missing evidence is NOT reconciliation.
  const validGeneration = (value) => (typeof value === "number"
    ? Number.isSafeInteger(value) && value > 0
    : typeof value === "string" && /^[1-9][0-9]*$/.test(value));
  if (!validGeneration(generation) || !validGeneration(observed)) {
    findings.push(enumResult("SIGNED_JOB_GENERATION_EVIDENCE_MISSING"));
  } else if (job?.reconciling === true || String(generation) !== String(observed)) {
    findings.push(enumResult("SIGNED_JOB_GENERATION_NOT_RECONCILED"));
  }
  // The failed historical run can never by itself authorize a new mission.
  return {
    status: "FORENSIC_ONLY_NOT_MISSION_READY",
    executionId: INCIDENT_EXECUTION,
    findings: [...new Set(findings)].sort(),
    currentJobImageMatchesFailedExecution: Boolean(jobImage && jobImage === executionImage),
    signedApprovalVerified: false,
    missionAuthorized: false,
    executionAttempted: false
  };
}
function main() {
  if (process.argv.length !== 4) {
    console.log(JSON.stringify({status:"BLOCKED",findings:["INPUTS_REQUIRED"]}));
    process.exitCode = 2; return;
  }
  try {
    const job = JSON.parse(readFileSync(process.argv[2],"utf8"));
    const execution = JSON.parse(readFileSync(process.argv[3],"utf8"));
    const report = inspectFailedExecution(job,execution);
    console.log(JSON.stringify(report));
    // We are inspecting a historical failed run, so a successful inspection is NOT readiness.
    if (report.findings.some(f=>f.endsWith("_UNREADABLE") || f.includes("IDENTITY_MISMATCH") ||
        f === "SIGNED_JOB_GENERATION_EVIDENCE_MISSING" ||
        f === "SIGNED_JOB_GENERATION_NOT_RECONCILED" ||
        f === "EXECUTION_PARENT_JOB_MISMATCH")) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({status:"BLOCKED",findings:["FORENSIC_SOURCE_INVALID"]}));
    process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
