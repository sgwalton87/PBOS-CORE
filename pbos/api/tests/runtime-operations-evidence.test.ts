import { describe, expect, it } from "vitest";
import { OperationalAlert, OperationalMetric, RuntimeOperationsObservation, verifyRuntimeOperations } from "../../tools/runtime-operations-evidence";

const metrics: OperationalMetric[] = ["HEALTH", "REQUEST_RATE", "ERROR_RATE", "P95_LATENCY", "AUTH_DENIAL", "STATE_DURABILITY"];
const alertKinds: OperationalAlert[] = ["SERVICE_UNAVAILABLE", "ERROR_BUDGET", "LATENCY", "AUTH_ANOMALY", "STATE_FAILURE"];
const valid = (): RuntimeOperationsObservation => ({
    service: "pbos-v1-integration-staging",
    metrics,
    dashboards: [{ dashboardId: "dashboard-1", displayName: "PBOS staging operations" }],
    alerts: alertKinds.map(kind => ({ alertId: `alert-${kind.toLowerCase()}`, kind, enabled: true, notificationChannelIds: ["channel-1"] })),
    notificationChannelsVerified: true,
    incident: { incidentId: "INCIDENT-DRILL-001", simulated: true,
        detectedAt: "2026-08-04T22:00:00.000Z", acknowledgedAt: "2026-08-04T22:03:00.000Z",
        mitigatedAt: "2026-08-04T22:12:00.000Z", closedAt: "2026-08-04T22:20:00.000Z",
        maximumAcknowledgeMinutes: 5, maximumMitigateMinutes: 15, auditEvidencePreserved: true, sensitiveDataExposed: false },
    recovery: { backupEvidenceId: "BACKUP-001", restoreEvidenceId: "RESTORE-001",
        objectiveRpoMinutes: 15, observedRpoMinutes: 5, objectiveRtoMinutes: 60, observedRtoMinutes: 49 },
    runbooks: { incident: "docs/operations/CIP-047-RUNTIME-OPERATIONS-RUNBOOK.md#incident-response",
        rollback: "docs/operations/CIP-047-RUNTIME-OPERATIONS-RUNBOOK.md#immutable-rollback",
        disasterRecovery: "docs/operations/CIP-047-RUNTIME-OPERATIONS-RUNBOOK.md#disaster-recovery" },
    onCallOwner: "PBOS Platform Operations",
    observedAt: "2026-08-04T22:25:00.000Z"
});

describe("CIP-047 runtime operations evidence", () => {
    it("certifies monitoring, alerting, incident response, and recovery objectives", () => {
        expect(verifyRuntimeOperations(valid())).toMatchObject({ evidenceId: "PBOS-OPERATIONS-PBOS-V1-INTEGRATION-STAGING-001",
            incidentId: "INCIDENT-DRILL-001", acknowledgeMinutes: 3, mitigateMinutes: 12, rtoMinutes: 49 });
    });

    it("rejects missing alerts, slow response, and failed recovery objectives", () => {
        expect(() => verifyRuntimeOperations({ ...valid(), alerts: valid().alerts.filter(item => item.kind !== "AUTH_ANOMALY") }))
            .toThrow("alerting");
        expect(() => verifyRuntimeOperations({ ...valid(), incident: { ...valid().incident, maximumMitigateMinutes: 10 } }))
            .toThrow("response exceeded");
        expect(() => verifyRuntimeOperations({ ...valid(), recovery: { ...valid().recovery, observedRtoMinutes: 61 } }))
            .toThrow("RPO or RTO");
    });
});
