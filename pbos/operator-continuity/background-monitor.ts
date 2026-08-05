import { randomUUID } from "crypto";
import { closeSync, mkdirSync, openSync } from "fs";
import { spawn } from "child_process";
import { execFile } from "child_process";
import { promisify } from "util";
import { GenesisWorkflowService } from "../genesis-console/genesis-workflow-service";
import { GenesisStateRepository } from "../genesis-state";
import { ResumableRemediationEngine } from "../validation-automation";
import { BackgroundMonitorJob } from "./contracts";
import { OperatorMemoService } from "./operator-memo-service";
import { AutonomousBatchService } from "./autonomous-batch-service";

export interface OperatorNotifier { notify(title: string, message: string): Promise<void>; }
export class DesktopOperatorNotifier implements OperatorNotifier {
    async notify(title: string, message: string): Promise<void> {
        if (process.platform !== "darwin") return;
        const escape = (value: string) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
        await promisify(execFile)("osascript", ["-e", `display notification "${escape(message)}" with title "${escape(title)}"`]);
    }
}

export class BackgroundProcessLauncher {
    constructor(private readonly executable: string, private readonly state: GenesisStateRepository, private readonly logRoot: string) {}
    launch(systemId: string, sessionId: string, runId: string): BackgroundMonitorJob {
        const existing = this.state.backgroundJobForRun(runId);
        if (existing?.status === "RUNNING" && this.alive(existing.pid)) return existing;
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
    private alive(pid: number): boolean {
        if (pid <= 0) return false;
        try { process.kill(pid, 0); return true; } catch { return false; }
    }
}

export class BackgroundMonitor {
    constructor(private readonly state: GenesisStateRepository, private readonly remediation: ResumableRemediationEngine,
        private readonly workflows: GenesisWorkflowService, private readonly memos: OperatorMemoService,
        private readonly wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
        private readonly batches = new AutonomousBatchService(state), private readonly notifier: OperatorNotifier = new DesktopOperatorNotifier()) {}

    async run(runId: string, sessionId: string, intervalMs = 30_000, maximumPolls = 120): Promise<void> {
        const session = this.state.sessions().find(item => item.sessionId === sessionId);
        if (!session) throw new Error(`Background session not found: ${sessionId}`);
        try {
            for (let poll = 0; poll < maximumPolls; poll += 1) {
                const result = await this.remediation.resume(runId, run => this.workflows.authorizeRemediation(session, run.pullRequest.branch));
                this.memos.write(session, result);
                const batch = this.batches.updateForValidation(runId, result.state);
                if (["READY_FOR_CERTIFICATION", "BLOCKED"].includes(result.state)) {
                    this.completeJob(runId, result.state === "BLOCKED" ? "BLOCKED" : "COMPLETED");
                    const label = result.state === "READY_FOR_CERTIFICATION" ? "ready for certification" : "blocked";
                    await this.notify("PBOS Genesis — Build update",
                        `${session.system.name}: ${batch?.workPackages.length ?? 0} work packages ${label}. ${result.pullRequest.url}`);
                    return;
                }
                await this.wait(intervalMs);
            }
            throw new Error("Background monitor reached its polling limit; resume from PBOS.");
        } catch (error) {
            this.completeJob(runId, "BLOCKED");
            const batch = this.batches.updateForValidation(runId, "BLOCKED");
            await this.notify("PBOS Genesis — Build blocked",
                `${session.system.name}: batch ${batch?.batchId ?? runId} requires operator review. ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    private async notify(title: string, message: string): Promise<void> {
        try { await this.notifier.notify(title, message); } catch { /* Notification failure never changes governed build state. */ }
    }

    private completeJob(runId: string, status: BackgroundMonitorJob["status"]): void {
        const job = this.state.backgroundJobForRun(runId);
        if (job) this.state.saveBackgroundJob({ ...job, status, updatedAt: new Date().toISOString() });
    }
}
