import { createHash, randomUUID } from "crypto";
import { CommandRunner, PullRequestReference } from "../platform";
import { PullRequestCheckEvidence, PullRequestLifecycleState } from "./contracts";

interface GhCheck { name: string; status?: string; conclusion?: string | null; details_url?: string; }
interface GhRun { attempt?: number; jobs?: readonly { steps?: readonly unknown[] }[]; }
interface GhPullRequestView {
    headRefOid: string;
    state: PullRequestLifecycleState;
    baseRefName: string;
    mergeCommit?: { oid?: string } | null;
}

export interface PullRequestCheckCollection {
    readonly headSha: string;
    readonly evidence: readonly PullRequestCheckEvidence[];
    readonly pullRequestState: PullRequestLifecycleState;
    readonly mergeCommitSha?: string;
    readonly baseRefName: string;
}

export class GitHubCheckCollector {
    constructor(private readonly commands: CommandRunner) {}

    async collect(pullRequest: PullRequestReference): Promise<PullRequestCheckCollection> {
        const view = await this.commands.run("gh", ["pr", "view", String(pullRequest.number), "--repo", pullRequest.repository,
            "--json", "headRefOid,state,baseRefName,mergeCommit"]);
        const metadata = JSON.parse(view.stdout) as GhPullRequestView;
        const pullRequestState = metadata.state;
        const mergeCommitSha = metadata.mergeCommit?.oid;
        if (!metadata.baseRefName?.trim()) {
            throw new Error(`Pull request ${pullRequest.url} did not expose its base branch.`);
        }
        if (pullRequestState === "MERGED" && !mergeCommitSha) {
            throw new Error(`Merged pull request ${pullRequest.url} did not expose its merge commit.`);
        }
        const headSha = String(pullRequestState === "MERGED" ? mergeCommitSha : metadata.headRefOid);
        const checks = await this.commands.run("gh", ["api", `repos/${pullRequest.repository}/commits/${headSha}/check-runs`]);
        const parsed = (JSON.parse(checks.stdout) as { check_runs?: GhCheck[] }).check_runs ?? [];
        const evidence = await Promise.all(parsed.map(check => this.evidence(check)));
        return { headSha, evidence, pullRequestState, mergeCommitSha, baseRefName: metadata.baseRefName };
    }

    async requestMergedValidation(pullRequest: PullRequestReference, baseRefName: string, mergeCommitSha: string): Promise<void> {
        if (!/^[A-Za-z0-9._/-]+$/.test(baseRefName) || baseRefName.includes("..") ||
            !/^[a-f0-9]{7,40}$/i.test(mergeCommitSha)) {
            throw new Error("Merged validation requires a safe base branch and exact merge commit.");
        }
        const base = await this.commands.run("gh", ["api", `repos/${pullRequest.repository}/commits/${baseRefName}`]);
        const baseSha = String((JSON.parse(base.stdout) as { sha?: string }).sha ?? "");
        if (baseSha !== mergeCommitSha) {
            throw new Error(`Default branch ${baseRefName} advanced to ${baseSha || "UNKNOWN"}; exact merged revision ${mergeCommitSha} requires a governed recovery branch.`);
        }
        await this.commands.run("gh", ["workflow", "run", "ci.yml", "--repo", pullRequest.repository, "--ref", baseRefName]);
    }

    fingerprint(evidence: readonly PullRequestCheckEvidence[]): string {
        const failures = evidence.filter(item => item.state === "FAILED").map(item => `${item.name}:${item.failureLog ?? ""}`).sort();
        return createHash("sha256").update(JSON.stringify(failures)).digest("hex");
    }

    async retryInfrastructure(evidence: PullRequestCheckEvidence): Promise<void> {
        if (evidence.state !== "INFRASTRUCTURE_WAIT" || !evidence.externalRunId || !evidence.detailsUrl) {
            throw new Error("Infrastructure retry requires a retryable GitHub Actions run reference.");
        }
        await this.commands.run("gh", ["run", "rerun", evidence.externalRunId, "--repo", this.repository(evidence.detailsUrl)]);
    }

    private async evidence(check: GhCheck): Promise<PullRequestCheckEvidence> {
        let state = check.status !== "completed" ? "PENDING" : this.state(check.conclusion ?? "");
        const detailsUrl = check.details_url;
        let failureLog: string | undefined;
        const runId = detailsUrl?.match(/\/actions\/runs\/(\d+)/)?.[1];
        let externalAttempt: number | undefined;
        let infrastructureReason: string | undefined;
        const conclusion = (check.conclusion ?? "").toLowerCase();
        if (state === "FAILED" && runId && detailsUrl && ["cancel", "cancelled", "startup_failure"].includes(conclusion)) {
            try {
                const inspected = await this.commands.run("gh", ["run", "view", runId, "--repo", this.repository(detailsUrl),
                    "--json", "attempt,jobs"]);
                const run = JSON.parse(inspected.stdout) as GhRun;
                externalAttempt = run.attempt;
                const steps = (run.jobs ?? []).flatMap(job => job.steps ?? []);
                if (steps.length === 0) {
                    state = "INFRASTRUCTURE_WAIT";
                    infrastructureReason = "GitHub Actions ended before assigning or executing any validation step.";
                }
            } catch (error) {
                infrastructureReason = `GitHub Actions interruption could not be inspected: ${error instanceof Error ? error.message : String(error)}`;
            }
        }
        if (state === "FAILED" && runId) {
            try {
                failureLog = (await this.commands.run("gh", ["run", "view", runId, "--repo", this.repository(detailsUrl!), "--log-failed"])).stdout.slice(-20_000);
            } catch (error) {
                failureLog = `Failure log unavailable: ${error instanceof Error ? error.message : String(error)}`;
            }
        }
        return { evidenceId: randomUUID(), name: check.name, state, detailsUrl, failureLog, externalRunId: runId,
            externalAttempt, infrastructureReason, collectedAt: new Date().toISOString() };
    }

    private state(value: string): PullRequestCheckEvidence["state"] {
        const normalized = value.toLowerCase();
        if (["pass", "success", "successful"].includes(normalized)) return "PASSED";
        if (["fail", "failure", "cancel", "cancelled", "timed_out", "action_required", "startup_failure", "stale"].includes(normalized)) return "FAILED";
        if (["skipping", "skipped", "neutral"].includes(normalized)) return "SKIPPED";
        return "PENDING";
    }
    private repository(url: string): string {
        const match = new URL(url).pathname.match(/^\/([^/]+\/[^/]+)\//);
        if (!match) throw new Error("Invalid GitHub Actions URL.");
        return match[1];
    }
}
