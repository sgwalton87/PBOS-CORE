import { readFileSync } from "node:fs";

export interface RuntimeRollbackObservation {
    readonly service: string;
    readonly knownGoodImageDigest: string;
    readonly candidateImageDigest: string;
    readonly rollbackImageDigest: string;
    readonly stateDigestBefore: string;
    readonly stateDigestAfter: string;
    readonly latestReadyRevision: string;
    readonly trafficPercent: number;
    readonly healthStatus: number;
    readonly anonymousConnectorStatus: number;
    readonly degradedDependencyDenied: boolean;
    readonly observedAt: string;
}

const sha256 = /^sha256:[a-f0-9]{64}$/;

export function verifyRuntimeRollback(observation: RuntimeRollbackObservation): unknown {
    if (!observation.service.trim() || !observation.latestReadyRevision.trim()) {
        throw new Error("Rollback evidence requires a service and ready revision.");
    }
    for (const value of [observation.knownGoodImageDigest, observation.candidateImageDigest,
        observation.rollbackImageDigest, observation.stateDigestBefore, observation.stateDigestAfter]) {
        if (!sha256.test(value)) throw new Error("Rollback evidence contains an invalid SHA-256 digest.");
    }
    if (observation.candidateImageDigest === observation.knownGoodImageDigest) {
        throw new Error("Rollback candidate must differ from the known-good image.");
    }
    if (observation.rollbackImageDigest !== observation.knownGoodImageDigest) {
        throw new Error("Rollback did not restore the known-good immutable image digest.");
    }
    if (observation.stateDigestAfter !== observation.stateDigestBefore) {
        throw new Error("Runtime state changed during rollback.");
    }
    if (observation.trafficPercent !== 100 || observation.healthStatus !== 200) {
        throw new Error("Rolled-back revision is not healthy and serving 100 percent of traffic.");
    }
    if (observation.anonymousConnectorStatus !== 401 || !observation.degradedDependencyDenied) {
        throw new Error("Rollback evidence does not prove fail-closed connector boundaries.");
    }
    if (Number.isNaN(Date.parse(observation.observedAt))) {
        throw new Error("Rollback evidence requires a valid observation timestamp.");
    }
    return {
        evidenceId: `PBOS-ROLLBACK-${observation.service.toUpperCase()}-001`,
        service: observation.service,
        restoredImageDigest: observation.rollbackImageDigest,
        stateDigest: observation.stateDigestAfter,
        readyRevision: observation.latestReadyRevision,
        healthStatus: observation.healthStatus,
        anonymousConnectorStatus: observation.anonymousConnectorStatus,
        degradedDependencyDenied: true,
        observedAt: observation.observedAt
    };
}

export function verifyRuntimeRollbackFile(path = process.env.PBOS_ROLLBACK_EVIDENCE_PATH?.trim()): unknown {
    if (!path) throw new Error("Required rollback evidence path is missing: PBOS_ROLLBACK_EVIDENCE_PATH");
    return verifyRuntimeRollback(JSON.parse(readFileSync(path, "utf8")) as RuntimeRollbackObservation);
}

if (require.main === module) {
    try { process.stdout.write(`${JSON.stringify(verifyRuntimeRollbackFile(), null, 2)}\n`); }
    catch (error) {
        process.stderr.write(`Runtime rollback evidence failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
