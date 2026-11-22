import { createHash } from "node:crypto";
import { existsSync, readFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { GenesisStateRepository, OperatorIdentityService } from "../genesis-state";
import { ProductionRuntimeService } from "../production-runtime";

export type OperatorPreflightReport = Readonly<{
    status: "INSPECTED" | "BLOCKED";
    missingFiles: readonly string[];
    operatorAuthenticated: boolean;
    integrityValid: boolean | null;
    runtimeHealth: string | null;
    activeRuns: number | null;
    activeLeases: number | null;
    queuedMissions: number | null;
    stateFingerprint: string | null;
    stateFilesUnchanged: boolean | null;
    approvalGranted: false;
}>;

function blocked(missingFiles: readonly string[] = []): OperatorPreflightReport {
    return { status: "BLOCKED", missingFiles, operatorAuthenticated: false,
        integrityValid: null, runtimeHealth: null, activeRuns: null, activeLeases: null,
        queuedMissions: null, stateFingerprint: null, stateFilesUnchanged: null,
        approvalGranted: false };
}

/**
 * Compare the three files in stable order: profile, operators, genesis-state.
 * A content hash is redacted evidence of a candidate state, not proof of host identity.
 */
export function compareReadOnlyStateDigests(before: readonly string[], after: readonly string[]): Readonly<{
    unchanged: boolean;
    stateFingerprint: string | null;
}> {
    const unchanged = before.length === 3 && after.length === 3 &&
        before.every((digest, index) => digest === after[index]);
    return { unchanged, stateFingerprint: unchanged ? after[2] : null };
}

/**
 * Inspect an EXISTING operator state without initialization, recovery,
 * persistence, repository operations, or disclosure of credentials.
 * An INSPECTED result is evidence of observation only, never execution approval.
 */
export function inspectExistingOperatorRuntime(stateHome: string): OperatorPreflightReport {
    const required = ["profile.json", "operators.json", "genesis-state.json"] as const;
    const missing = required.filter(file => !existsSync(join(stateHome, file)));
    if (missing.length) return blocked(missing);

    // Do not trust a writable or redirected identity/state file on a hosted
    // worker. A successful JSON parse is not sufficient to admit authority.
    for (const file of required) {
        try {
            const metadata = lstatSync(join(stateHome, file));
            if (!metadata.isFile() || metadata.isSymbolicLink() ||
                metadata.size === 0 || (metadata.mode & 0o077) !== 0) {
                return blocked();
            }
        } catch {
            return blocked();
        }
    }

    const statePaths = required.map(file => join(stateHome, file));
    const sha256 = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
    try {
        const before = statePaths.map(sha256);
        const profile = JSON.parse(readFileSync(join(stateHome, "profile.json"), "utf8")) as {
            operatorId?: string; credential?: string; organizationId?: string;
        };
        if (!profile.operatorId || !profile.credential || !profile.organizationId) return blocked();
        const operator = new OperatorIdentityService(join(stateHome, "operators.json"))
            .authenticate(profile.operatorId, profile.credential);
        if (operator.organizationId !== profile.organizationId) return blocked();

        const state = new GenesisStateRepository(join(stateHome, "genesis-state.json"));
        const production = new ProductionRuntimeService(state);
        const integrity = production.verifyIntegrity();
        const health = production.health();
        const active = state.productionRuns().filter(run =>
            ["AUTHORIZED", "QUEUED", "STARTING", "RUNNING", "VALIDATING", "REPAIRING",
                "GENERATING_PREVIEW", "AWAITING_APPROVAL", "RECOVERING"].includes(run.status));
        // Detect concurrent edits to any identity or mission state inspected.
        // A stable hash does not establish that this is the ORIGINAL operator host.
        const after = statePaths.map(sha256);
        const { unchanged, stateFingerprint } = compareReadOnlyStateDigests(before, after);
        return {
            status: integrity.valid && unchanged ? "INSPECTED" : "BLOCKED",
            missingFiles: [],
            operatorAuthenticated: true,
            integrityValid: integrity.valid,
            runtimeHealth: health.health,
            activeRuns: active.length,
            activeLeases: state.executionLeases().filter(lease => lease.status === "ACTIVE").length,
            queuedMissions: state.missionQueue().length,
            stateFingerprint,
            stateFilesUnchanged: unchanged,
            approvalGranted: false
        };
    } catch {
        // Never print credential, signing key, state JSON, or filesystem errors.
        return blocked();
    }
}
