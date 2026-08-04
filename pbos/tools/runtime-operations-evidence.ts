import { readFileSync } from "node:fs";

export type OperationalMetric = "HEALTH" | "REQUEST_RATE" | "ERROR_RATE" | "P95_LATENCY" | "AUTH_DENIAL" | "STATE_DURABILITY";
export type OperationalAlert = "SERVICE_UNAVAILABLE" | "ERROR_BUDGET" | "LATENCY" | "AUTH_ANOMALY" | "STATE_FAILURE";

export interface RuntimeOperationsObservation {
    readonly service: string;
    readonly metrics: readonly OperationalMetric[];
    readonly dashboards: readonly Readonly<{ dashboardId: string; displayName: string }>[];
    readonly alerts: readonly Readonly<{ alertId: string; kind: OperationalAlert; enabled: boolean; notificationChannelIds: readonly string[] }>[];
    readonly notificationChannelsVerified: boolean;
    readonly incident: Readonly<{
        incidentId: string;
        simulated: boolean;
        detectedAt: string;
        acknowledgedAt: string;
        mitigatedAt: string;
        closedAt: string;
        maximumAcknowledgeMinutes: number;
        maximumMitigateMinutes: number;
        auditEvidencePreserved: boolean;
        sensitiveDataExposed: boolean;
    }>;
    readonly recovery: Readonly<{
        backupEvidenceId: string;
        restoreEvidenceId: string;
        objectiveRpoMinutes: number;
        observedRpoMinutes: number;
        objectiveRtoMinutes: number;
        observedRtoMinutes: number;
    }>;
    readonly runbooks: Readonly<{ incident: string; rollback: string; disasterRecovery: string }>;
    readonly onCallOwner: string;
    readonly observedAt: string;
}

const REQUIRED_METRICS: readonly OperationalMetric[] = ["HEALTH", "REQUEST_RATE", "ERROR_RATE", "P95_LATENCY", "AUTH_DENIAL", "STATE_DURABILITY"];
const REQUIRED_ALERTS: readonly OperationalAlert[] = ["SERVICE_UNAVAILABLE", "ERROR_BUDGET", "LATENCY", "AUTH_ANOMALY", "STATE_FAILURE"];
const minutes = (from: number, to: number): number => Number(((to - from) / 60_000).toFixed(2));
const nonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

export function verifyRuntimeOperations(observation: RuntimeOperationsObservation): unknown {
    if (!observation.service.trim() || !observation.onCallOwner.trim()) {
        throw new Error("Operational evidence requires service identity and an accountable on-call owner.");
    }
    if (REQUIRED_METRICS.some(metric => !observation.metrics.includes(metric)) || observation.dashboards.length === 0
        || observation.dashboards.some(item => !item.dashboardId.trim() || !item.displayName.trim())) {
        throw new Error("Operational dashboards do not cover all required runtime signals.");
    }
    if (REQUIRED_ALERTS.some(kind => !observation.alerts.some(alert => alert.kind === kind && alert.enabled
        && alert.alertId.trim() && alert.notificationChannelIds.length > 0)) || !observation.notificationChannelsVerified) {
        throw new Error("Operational alerting and notification routing are incomplete.");
    }
    const incident = observation.incident;
    const timestamps = [incident.detectedAt, incident.acknowledgedAt, incident.mitigatedAt, incident.closedAt]
        .map(value => Date.parse(value));
    if (!incident.incidentId.trim() || !incident.simulated || timestamps.some(Number.isNaN)
        || timestamps.some((value, index) => index > 0 && value < timestamps[index - 1])) {
        throw new Error("Incident drill identity, mode, or timeline is invalid.");
    }
    const acknowledgeMinutes = minutes(timestamps[0], timestamps[1]);
    const mitigateMinutes = minutes(timestamps[0], timestamps[2]);
    if (!nonNegative(incident.maximumAcknowledgeMinutes) || !nonNegative(incident.maximumMitigateMinutes)
        || acknowledgeMinutes > incident.maximumAcknowledgeMinutes || mitigateMinutes > incident.maximumMitigateMinutes) {
        throw new Error("Incident response exceeded its approved acknowledgement or mitigation objective.");
    }
    if (!incident.auditEvidencePreserved || incident.sensitiveDataExposed) {
        throw new Error("Incident drill did not preserve audit evidence and data confidentiality.");
    }
    const recovery = observation.recovery;
    const recoveryValues = [recovery.objectiveRpoMinutes, recovery.observedRpoMinutes,
        recovery.objectiveRtoMinutes, recovery.observedRtoMinutes];
    if (!recovery.backupEvidenceId.trim() || !recovery.restoreEvidenceId.trim() || recoveryValues.some(value => !nonNegative(value))
        || recovery.observedRpoMinutes > recovery.objectiveRpoMinutes || recovery.observedRtoMinutes > recovery.objectiveRtoMinutes) {
        throw new Error("Disaster recovery evidence does not satisfy the approved RPO or RTO.");
    }
    if (Object.values(observation.runbooks).some(value => !value.trim())) {
        throw new Error("Incident, rollback, and disaster-recovery runbooks are required.");
    }
    if (Number.isNaN(Date.parse(observation.observedAt))) throw new Error("Operational evidence requires a valid observation timestamp.");
    return {
        evidenceId: `PBOS-OPERATIONS-${observation.service.toUpperCase()}-001`,
        service: observation.service,
        dashboardIds: observation.dashboards.map(item => item.dashboardId),
        alertIds: observation.alerts.map(item => item.alertId),
        incidentId: incident.incidentId,
        acknowledgeMinutes,
        mitigateMinutes,
        rpoMinutes: recovery.observedRpoMinutes,
        rtoMinutes: recovery.observedRtoMinutes,
        onCallOwner: observation.onCallOwner,
        observedAt: observation.observedAt
    };
}

export function verifyRuntimeOperationsFile(path = process.env.PBOS_OPERATIONS_EVIDENCE_PATH?.trim()): unknown {
    if (!path) throw new Error("Required operations evidence path is missing: PBOS_OPERATIONS_EVIDENCE_PATH");
    return verifyRuntimeOperations(JSON.parse(readFileSync(path, "utf8")) as RuntimeOperationsObservation);
}

if (require.main === module) {
    try { process.stdout.write(`${JSON.stringify(verifyRuntimeOperationsFile(), null, 2)}\n`); }
    catch (error) {
        process.stderr.write(`Runtime operations evidence failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
