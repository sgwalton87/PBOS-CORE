import { evidenceGitSha, evidenceDigest } from "./remote-attestation";
import type { Mb03Mission } from "./mb03-disposable-mission";

/** Only the two independently signed, nonproduction Playbook MB-03 missions. */
export type PlaybookMb03MissionId = "MB03-MISSION-001" | "MB03-MISSION-002";
export const PLAYBOOK_REMOTE_REPOSITORY = "sgwalton87/playbook-platform";

export interface PlaybookRemoteTarget {
    readonly missionId: PlaybookMb03MissionId;
    /** Exact content already tracked at the reviewed Playbook SHA. */
    readonly before: string;
    /** Exact independently approved content the Codex worker must produce. */
    readonly after: string;
}

export function playbookRemotePath(missionId: string): string {
    if (missionId !== "MB03-MISSION-001" && missionId !== "MB03-MISSION-002") {
        throw new Error("Only two separately approved Playbook MB-03 missions are eligible.");
    }
    return "docs/pbos-missions/" + missionId + ".md";
}

export function assertPlaybookRemoteTarget(target: PlaybookRemoteTarget): Readonly<{
    path: string;
    beforeSha256: string;
    afterSha256: string;
}> {
    const path = playbookRemotePath(target.missionId);
    if (typeof target.before !== "string" || typeof target.after !== "string" ||
        !target.before || !target.after || target.before === target.after ||
        Buffer.byteLength(target.before, "utf8") > 256 * 1024 ||
        Buffer.byteLength(target.after, "utf8") > 256 * 1024 ||
        target.before.includes("\0") || target.after.includes("\0")) {
        throw new Error("Playbook remote mission requires distinct, bounded exact-file contents.");
    }
    return { path, beforeSha256: evidenceDigest(target.before), afterSha256: evidenceDigest(target.after) };
}

export function createRemotePlaybookMission(
    sourceSha: string, workerId: string, stateNamespace: string, attemptId: string,
    target: PlaybookRemoteTarget
): Mb03Mission {
    if (!evidenceGitSha(sourceSha) || !/^[A-Za-z0-9._-]+$/.test(workerId) ||
        !/^[A-Za-z0-9._-]+$/.test(stateNamespace) || !/^[A-Za-z0-9._-]+$/.test(attemptId)) {
        throw new Error("Playbook remote worker identity and exact source SHA are required.");
    }
    const { path } = assertPlaybookRemoteTarget(target);
    return {
        missionId: target.missionId,
        repository: PLAYBOOK_REMOTE_REPOSITORY,
        environment: "DISPOSABLE",
        sourceSha, workerId, stateNamespace, attemptId,
        allowedPaths: [path]
    };
}
