import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { ResumableRemediationEngine } from "../validation-automation";
import { BackgroundProcessLauncher } from "./background-monitor";
import { OperatorMemoService } from "./operator-memo-service";

export class OperatorContinuityService {
    constructor(private readonly remediation: ResumableRemediationEngine, private readonly memos: OperatorMemoService,
        private readonly background: BackgroundProcessLauncher) {}

    summarize(session: GenesisBuildSession) {
        const run = this.remediation.latest(session.system.systemId);
        const memo = this.memos.write(session, run);
        return { run, memo, lines: ["SESSION SUMMARY", `System: ${session.system.name}`, `Session: ${session.sessionId}`,
            `Status: ${run?.state ?? "SESSION_ACTIVE"}`, ...(run ? [`Draft PR: ${run.pullRequest.url}`, `Validation attempt: ${run.attempt}/${run.maximumAttempts}`] : []),
            `Memo saved: ${memo.path}`] };
    }

    launchBackground(session: GenesisBuildSession) {
        const run = this.remediation.latest(session.system.systemId);
        if (!run || ["READY_FOR_CERTIFICATION", "BLOCKED"].includes(run.state)) return undefined;
        return this.background.launch(session.system.systemId, session.sessionId, run.runId);
    }
}
