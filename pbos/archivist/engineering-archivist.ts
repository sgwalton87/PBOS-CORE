import { createHash } from "crypto";
import { ArchivistMilestoneRecord, ArchivistMilestoneRequest } from "./contracts";

const milestonePattern = /^milestone(?:\([^)]*\))?:\s+.+/i;

export function isQualifyingMilestone(message: string): boolean {
    return milestonePattern.test(message.trim());
}

export class EngineeringArchivist {
    archive(request: ArchivistMilestoneRequest): ArchivistMilestoneRecord {
        if (!isQualifyingMilestone(request.message)) {
            throw new Error("Archivist records require a qualifying Milestone: commit message.");
        }
        if (!request.systemId || !request.repository || !request.revision) {
            throw new Error("Archivist records require system, repository, and revision lineage.");
        }
        if (request.validation.length === 0 || request.validation.some(item => !item.reference)) {
            throw new Error("Archivist records require referenced validation evidence.");
        }

        const state = request.validation.every(item => item.state === "PASSED") ? "VERIFIED" : "VALIDATION_FAILED";
        const timestamp = request.recordedAt.toISOString();
        const day = timestamp.slice(0, 10);
        const fileStamp = timestamp.replaceAll(":", "-").replace("T", "_").replace(".000Z", "Z");
        const slug = request.message.replace(/^milestone(?:\([^)]*\))?:\s*/i, "")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "milestone";
        const canonical = JSON.stringify({ ...request, recordedAt: timestamp, state });
        const digest = createHash("sha256").update(canonical).digest("hex");
        const archiveId = `PBOS-ARCHIVE-${digest.slice(0, 16).toUpperCase()}`;
        const validation = request.validation.map(item => `- ${item.state === "PASSED" ? "PASS" : "FAIL"}: \`${item.command}\` — ${item.reference}`).join("\n");
        const progress = `\`\`\`json\n${JSON.stringify(request.progress, null, 2)}\n\`\`\``;
        const milestonePath = `docs/project-management/milestones/${fileStamp}-${slug}.md`;
        const snapshotPath = `docs/project-management/snapshots/${fileStamp}-${slug}.md`;
        const heading = `# ${request.systemName} Milestone\n\n`;
        const body = `- Archive: ${archiveId}\n- System: ${request.systemId}\n- Repository: ${request.repository}\n- Revision: ${request.revision}\n- Recorded: ${timestamp}\n- State: ${state}\n- Digest: sha256:${digest}\n\n## Milestone\n\n${request.message}\n\n## Validation Evidence\n\n${validation}\n\n## Progress\n\n${progress}\n`;
        const journal = `\n## ${timestamp} — ${request.message}\n\n- System: ${request.systemName} (${request.systemId})\n- Revision: ${request.revision}\n- Evidence state: ${state}\n- Archive: ${archiveId}\n`;

        return {
            archiveId,
            state,
            digest,
            lineage: [request.systemId, request.repository, request.revision, ...request.validation.map(item => item.reference)],
            files: [
                { path: milestonePath, content: `${heading}${body}` },
                { path: snapshotPath, content: `${heading}${body}` },
                { path: "docs/project-management/snapshots/latest.md", content: `${heading}${body}` },
                { path: `founders-journal/daily/${day}.md`, content: journal }
            ]
        };
    }
}
