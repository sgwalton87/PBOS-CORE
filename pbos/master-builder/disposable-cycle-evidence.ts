import { createHash } from "node:crypto";
import type { MasterBuilderMissionBinding } from "./mission-binding-gate";

export type MasterBuilderCycleStage =
  "SELECT" | "PLAN" | "BUILD" | "TEST" | "VERIFY" | "DOCUMENT" | "PROPOSE";

export interface MasterBuilderCycleEvidence {
  readonly mission: MasterBuilderMissionBinding;
  readonly stages: readonly Readonly<{
    stage: MasterBuilderCycleStage;
    passed: boolean;
    evidenceId: string;
    revision: string;
    recordedAt: string;
  }>[];
  readonly proposal: Readonly<{ repository: string; branch: string; baseSha: string; headSha: string; url?: string }>;
}

const STAGES: readonly MasterBuilderCycleStage[] =
  ["SELECT", "PLAN", "BUILD", "TEST", "VERIFY", "DOCUMENT", "PROPOSE"];

export function inspectDisposableCycleEvidence(evidence: MasterBuilderCycleEvidence):
  Readonly<{ complete: boolean; findings: readonly string[]; digest: string }> {
  const findings: string[] = [];
  const { mission, stages, proposal } = evidence;
  if (mission.environment !== "DISPOSABLE" || !/^[a-f0-9]{40}$/i.test(mission.sourceSha)) {
    findings.push("Mission is not bound to a disposable exact revision.");
  }
  if (stages.length !== STAGES.length) findings.push("Missing or extra lifecycle stages.");
  let previousTimestamp = -Infinity;
  STAGES.forEach((stage, index) => {
    const record = stages[index];
    if (!record || record.stage !== stage || !record.passed ||
        !record.evidenceId.trim() || record.revision !== mission.sourceSha ||
        !Number.isFinite(Date.parse(record.recordedAt))) {
      findings.push(`Unverified lifecycle stage: ${stage}`);
    }
    const timestamp = record ? Date.parse(record.recordedAt) : NaN;
    if (!Number.isFinite(timestamp) || timestamp < previousTimestamp) {
      findings.push(`Lifecycle timestamps are invalid or out of order at: ${stage}`);
    }
    if (Number.isFinite(timestamp)) previousTimestamp = timestamp;
  });
  if (new Set(stages.map(item => item.evidenceId)).size !== stages.length) {
    findings.push("Lifecycle evidence identifiers must be unique.");
  }
  if (proposal.repository !== mission.repository || proposal.baseSha !== mission.sourceSha ||
      !proposal.branch.startsWith("disposable/") ||
      !/^[a-f0-9]{40}$/i.test(proposal.headSha) ||
      proposal.headSha === proposal.baseSha) {
    findings.push("Proposal is not a distinct disposable revision of the selected source.");
  }
  if (proposal.url) {
    try {
      const url = new URL(proposal.url);
      if (url.protocol !== "https:" || url.hostname !== "github.com" ||
          !url.pathname.startsWith(`/${mission.repository}/pull/`) ||
          !/^[0-9]+$/.test(url.pathname.slice(`/${mission.repository}/pull/`.length))) {
        findings.push("Proposal URL is not an exact GitHub pull request for the mission repository.");
      }
    } catch {
      findings.push("Proposal URL is invalid.");
    }
  }
  const digest = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
  return { complete: findings.length === 0, findings, digest };
}
