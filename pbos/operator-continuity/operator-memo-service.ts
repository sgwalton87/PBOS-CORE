import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GenesisStateRepository } from "../genesis-state";
import { RemediationRun } from "../validation-automation";
import { OperatorMemoRecord } from "./contracts";

export class OperatorMemoService {
    constructor(private readonly root: string, private readonly state: GenesisStateRepository) {}

    write(session: GenesisBuildSession, run?: RemediationRun): OperatorMemoRecord {
        const directory = join(this.root, session.system.systemId);
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        const createdAt = new Date().toISOString();
        const path = join(directory, `session-${session.sessionId}.md`);
        const batch = [...this.state.autonomousBatches()].reverse().find(item => item.sessionId === session.sessionId);
        const telemetry = batch ? this.state.batchTelemetry(batch.batchId) : [];
        const production = run ? [...this.state.productionRuns()].reverse().find(item =>
            item.systemId === session.system.systemId && item.evidenceIds.includes(`remediation-run:${run.runId}`)) : undefined;
        const preview = production?.functionalAcceptancePlan?.durablePreview;
        const next = run?.state === "READY_FOR_CERTIFICATION" ? "Review certification memo and approve or reject certification."
            : run?.state === "BLOCKED" ? "Review the blockers and provide a governed decision."
            : run?.state === "WAITING_FOR_INFRASTRUCTURE" ? "GitHub Actions did not execute the validation job. PBOS preserved the exact revision and is using its separate bounded infrastructure retry policy; no code repair or operator action is required."
            : run ? "PBOS is monitoring GitHub Actions automatically. No operator action is required until notification."
            : "Resume PBOS and select the next governed workflow action.";
        const certification = run?.state === "READY_FOR_CERTIFICATION"
            ? "\n## Certification Readiness\n\nValidation evidence is complete. Human certification approval is required before merge or public promotion.\n"
            : "";
        const previewLinks = preview ? `\n## Commit-Bound Preview Links\n\n- Web: ${preview.webUrl}\n- Mobile: ${preview.mobileUrl}\n` +
            `${preview.iosUrl ? `- iOS: ${preview.iosUrl}\n` : ""}${preview.androidUrl ? `- Android: ${preview.androidUrl}\n` : ""}` : "";
        const body = `# PBOS Operator Session Memo\n\n- System: ${session.system.name}\n- System ID: ${session.system.systemId}\n- Session: ${session.sessionId}\n- Authority: ${session.grant.mode}\n- Repository: ${session.system.repository}\n- Generated: ${createdAt}\n- Status: ${run?.state ?? "SESSION_ACTIVE"}\n${batch ? `- Batch: ${batch.batchId}\n- Work packages: ${batch.workPackages.length}/${batch.packageLimit}\n` : ""}${run ? `- Validation run: ${run.runId}\n- Attempt: ${run.attempt}/${run.maximumAttempts}\n- Pull request: ${run.pullRequest.url}\n` : ""}${certification}${previewLinks}\n## Next Recommended Action\n\n${next}\n${batch ? `\n## Authorized Work Packages\n\n${batch.workPackages.map((item, index) => `${index + 1}. ${item.title} (${item.workPackageId})`).join("\n")}\n` : ""}${telemetry.length ? `\n## Build Telemetry\n\n${telemetry.map(event => `- ${event.occurredAt} — **${event.type}** — ${event.title}: ${event.detail}`).join("\n")}\n` : ""}${run?.blockers.length ? `\n## Blockers\n\n${run.blockers.map(item => `- ${item}`).join("\n")}\n` : ""}`;
        writeFileSync(path, body, { encoding: "utf8", mode: 0o600 });
        const record: OperatorMemoRecord = { memoId: randomUUID(), systemId: session.system.systemId, sessionId: session.sessionId,
            runId: run?.runId, state: run?.state ?? "SESSION_ACTIVE", path, createdAt };
        this.state.saveMemo(record);
        return record;
    }

    latest(systemId?: string): { record: OperatorMemoRecord; content: string } | undefined {
        const record = [...this.state.memos()].reverse().find(item => !systemId || item.systemId === systemId);
        return record ? { record, content: readFileSync(record.path, "utf8") } : undefined;
    }
}
