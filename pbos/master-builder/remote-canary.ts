import { evidenceGitSha } from "./remote-attestation";
import type { Mb03Mission } from "./mb03-disposable-mission";

export const CANARY_REPOSITORY = "sgwalton87/PBOS-CORE";
export const CANARY_PATH = "pbos/master-builder/tests/fixtures/remote-canary.txt";
export const CANARY_BEFORE = "PBOS-REMOTE-CANARY: pending\n";
export const CANARY_AFTER = "PBOS-REMOTE-CANARY: completed\n";

export function createRemoteCanaryMission(sourceSha: string, workerId: string, stateNamespace: string, attemptId: string): Mb03Mission {
    if (!evidenceGitSha(sourceSha)) throw new Error("The reviewed canary source requires a full SHA.");
    return { missionId: "mb032-remote-canary", repository: CANARY_REPOSITORY, environment: "DISPOSABLE", sourceSha,
        workerId, stateNamespace, attemptId, allowedPaths: [CANARY_PATH] };
}
