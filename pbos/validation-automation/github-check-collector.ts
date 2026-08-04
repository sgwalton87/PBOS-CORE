import { createHash, randomUUID } from "crypto";
import { CommandRunner, PullRequestReference } from "../platform";
import { PullRequestCheckEvidence } from "./contracts";

interface GhCheck { name: string; status?: string; conclusion?: string | null; details_url?: string; }

export class GitHubCheckCollector {
    constructor(private readonly commands: CommandRunner) {}

    async collect(pullRequest: PullRequestReference): Promise<{ headSha: string; evidence: readonly PullRequestCheckEvidence[] }> {
        const view = await this.commands.run("gh", ["pr", "view", String(pullRequest.number), "--repo", pullRequest.repository, "--json", "headRefOid"]);
        const headSha = String((JSON.parse(view.stdout) as { headRefOid: string }).headRefOid);
        const checks = await this.commands.run("gh", ["api", `repos/${pullRequest.repository}/commits/${headSha}/check-runs`]);
        const parsed = (JSON.parse(checks.stdout) as { check_runs?: GhCheck[] }).check_runs ?? [];
        const evidence = await Promise.all(parsed.map(check => this.evidence(check)));
        return { headSha, evidence };
    }

    fingerprint(evidence: readonly PullRequestCheckEvidence[]): string {
        const failures = evidence.filter(item => item.state === "FAILED").map(item => `${item.name}:${item.failureLog ?? ""}`).sort();
        return createHash("sha256").update(JSON.stringify(failures)).digest("hex");
    }

    private async evidence(check: GhCheck): Promise<PullRequestCheckEvidence> {
        const state = check.status !== "completed" ? "PENDING" : this.state(check.conclusion ?? "");
        const detailsUrl = check.details_url;
        let failureLog: string | undefined;
        const runId = detailsUrl?.match(/\/actions\/runs\/(\d+)/)?.[1];
        if (state === "FAILED" && runId) {
            try {
                failureLog = (await this.commands.run("gh", ["run", "view", runId, "--repo", this.repository(detailsUrl!), "--log-failed"])).stdout.slice(-20_000);
            } catch (error) {
                failureLog = `Failure log unavailable: ${error instanceof Error ? error.message : String(error)}`;
            }
        }
        return { evidenceId: randomUUID(), name: check.name, state, detailsUrl, failureLog, collectedAt: new Date().toISOString() };
    }

    private state(value: string): PullRequestCheckEvidence["state"] {
        const normalized = value.toLowerCase();
        if (["pass", "success", "successful"].includes(normalized)) return "PASSED";
        if (["fail", "failure", "cancel", "cancelled", "timed_out", "action_required"].includes(normalized)) return "FAILED";
        if (["skipping", "skipped", "neutral"].includes(normalized)) return "SKIPPED";
        return "PENDING";
    }
    private repository(url: string): string {
        const match = new URL(url).pathname.match(/^\/([^/]+\/[^/]+)\//);
        if (!match) throw new Error("Invalid GitHub Actions URL.");
        return match[1];
    }
}
