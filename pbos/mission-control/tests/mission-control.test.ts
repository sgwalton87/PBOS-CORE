import { describe, expect, it } from "vitest";
import { renderMissionControl } from "../mission-control-view";
import { MissionControlSnapshot } from "../../production-runtime";

describe("PBOS founder Mission Control", () => {
    it("renders authoritative active, timing, health, event, and next-mission regions", () => {
        const snapshot = { connection: "CONNECTED", status: "RUNNING", generatedAt: "2026-08-05T00:00:00Z",
            sourceVersion: "PBOS-PRODUCTION-RUNTIME-1", recentEvents: [], history: [], health: { health: "HEALTHY", checkedAt: "2026-08-05T00:00:00Z", components: [] },
            metrics: { runsStarted: 1, runsCompleted: 0, runsFailed: 0, runsBlocked: 0, runsRecovered: 0, totalDurationMs: 0,
                medianDurationMs: 0, repairAttempts: 0, certificationRate: 0, queueDepth: 1, activeRunCount: 1, staleLeaseCount: 0 }
        } as MissionControlSnapshot;
        const html = renderMissionControl(snapshot);
        expect(html).toContain("Mission Control");
        expect(html).toContain("Active Build");
        expect(html).toContain("Live Activity");
        expect(html).toContain("Health & Metrics");
        expect(html).toContain("Result Preview");
        expect(html).toContain("Open desktop web app");
        expect(html).toContain("Open mobile app");
        expect(html).toContain("Historical Runs");
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain("DISCONNECTED · STATE UNKNOWN");
        expect(html).toContain("prefers-reduced-motion");
    });
});
