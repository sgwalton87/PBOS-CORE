import { existsSync, readFileSync } from "node:fs";
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
    approvalGranted: false;
}>;

function blocked(missingFiles: readonly string[] = []): OperatorPreflightReport {
    return { status: "BLOCKED", missingFiles, operatorAuthenticated: false,
        integrityValid: null, runtimeHealth: null, activeRuns: null, activeLeases: null,
        queuedMissions: null, approvalGranted: false };
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

    try {
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
        return {
            status: integrity.valid ? "INSPECTED" : "BLOCKED",
            missingFiles: [],
            operatorAuthenticated: true,
            integrityValid: integrity.valid,
            runtimeHealth: health.health,
            activeRuns: active.length,
            activeLeases: state.executionLeases().filter(lease => lease.status === "ACTIVE").length,
            queuedMissions: state.missionQueue().length,
            approvalGranted: false
        };
    } catch {
        // Never print credential, signing key, state JSON, or filesystem errors.
        return blocked();
    }
}
