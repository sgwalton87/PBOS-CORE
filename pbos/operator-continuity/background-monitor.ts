import { randomUUID } from "crypto";
import { closeSync, mkdirSync, openSync } from "fs";
import { spawn } from "child_process";
import { GenesisWorkflowService } from "../genesis-console/genesis-workflow-service";
import { GenesisStateRepository } from "../genesis-state";
import { ResumableRemediationEngine } from "../validation-automation";
import { BackgroundMonitorJob } from "./contracts";
import { OperatorMemoService } from "./operator-memo-service";

export class BackgroundProcessLauncher {
    constructor(private readonly executable: string, private readonly state: GenesisStateRepository, private readonly logRoot: string) {}
    launch(systemId: string, sessionId: string, runId: string): BackgroundMonitorJob {
        mkdirSync(this.logRoot, { recursive: true, mode: 0o700 });
        const logPath = `${this.logRoot}/${runId}.log`;
        const output = openSync(logPath, "a", 0o600);
        const child = spawn(process.execPath, [this.executable, "monitor", runId, sessionId], { detached: true, stdio: ["ignore", output, output] });
        child.unref(); closeSync(output);
        const now = new Date().toISOString();
        const job: BackgroundMonitorJob = { jobId: randomUUID(), systemId, sessionId, runId, pid: child.pid ?? -1,
            logPath, status: "RUNNING", startedAt: now, updatedAt: now };
        this.state.saveBackgroundJob(job);
        return job;
    }
}

export class BackgroundMonitor {
    constructor(private readonly state: GenesisStateRepository, private readonly remediation: ResumableRemediationEngine,
        private readonly workflows: GenesisWorkflowService, private readonly memos: OperatorMemoService,
        private readonly wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))) {}

    async run(runId: string, sessionId: string, intervalMs = 30_000, maximumPolls = 120): Promise<void> {
        const session = this.state.sessions().find(item => item.sessionId === sessionId);
        if (!session) throw new Error(`Background session not found: ${sessionId}`);
        try {
            for (let poll = 0; poll < maximumPolls; poll += 1) {
                const result = await this.remediation.resume(runId, run => this.workflows.authorizeRemediation(session, run.pullRequest.branch));
                this.memos.write(session, result);
                if (["READY_FOR_CERTIFICATION", "BLOCKED"].includes(result.state)) {
                    this.completeJob(runId, result.state === "BLOCKED" ? "BLOCKED" : "COMPLETED");
                    return;
                }
                await this.wait(intervalMs);
            }
            throw new Error("Background monitor reached its polling limit; resume from PBOS.");
        } catch (error) {
            this.completeJob(runId, "BLOCKED");
            throw error;
        }
    }

    private completeJob(runId: string, status: BackgroundMonitorJob["status"]): void {
        const job = this.state.backgroundJobForRun(runId);
        if (job) this.state.saveBackgroundJob({ ...job, status, updatedAt: new Date().toISOString() });
    }
}
