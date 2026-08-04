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
        const next = run?.state === "READY_FOR_CERTIFICATION" ? "Review certification memo and approve or reject certification."
            : run?.state === "BLOCKED" ? "Review the blockers and provide a governed decision."
            : run ? "Allow GitHub Actions to update, then resume validation evidence collection."
            : "Resume PBOS and select the next governed workflow action.";
        const body = `# PBOS Operator Session Memo\n\n- System: ${session.system.name}\n- System ID: ${session.system.systemId}\n- Session: ${session.sessionId}\n- Authority: ${session.grant.mode}\n- Repository: ${session.system.repository}\n- Generated: ${createdAt}\n- Status: ${run?.state ?? "SESSION_ACTIVE"}\n${run ? `- Validation run: ${run.runId}\n- Attempt: ${run.attempt}/${run.maximumAttempts}\n- Pull request: ${run.pullRequest.url}\n` : ""}\n## Next Recommended Action\n\n${next}\n${run?.blockers.length ? `\n## Blockers\n\n${run.blockers.map(item => `- ${item}`).join("\n")}\n` : ""}`;
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
