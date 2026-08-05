import { describe, expect, it } from "vitest";
import { ApplicationJourney, ApplicationReadinessCompiler, ApplicationSurface, JourneyEvidence, RepositoryReadinessInventoryCompiler } from "../index";

const journeys: ApplicationJourney[] = ["IDENTITY_ONBOARDING", "DASHBOARD", "ACADEMIC", "OPPORTUNITY", "APPLICATIONS", "SUPPORT_NETWORK", "MESSAGING", "DOCUMENTS", "NOTIFICATIONS"];
const evidence = (surface: ApplicationSurface, journey: ApplicationJourney): JourneyEvidence => ({ journey, surface,
    implementationPaths: [`src/${surface.toLowerCase()}/${journey.toLowerCase()}.tsx`], testPaths: [`tests/${journey.toLowerCase()}.test.ts`],
    usesDurableData: true, authorityAndProvenance: true, responsive: true, accessible: true });

describe("CIP-048 and CIP-049 application readiness", () => {
    it("requires every web journey and primary mobile journey at an exact revision", () => {
        const report = new ApplicationReadinessCompiler().compile({ repository: "sgwalton87/playbook-platform", revision: "aa94b6d",
            branch: "agent/cip-045-scholar-runtime", routeCount: 93, testCount: 93, databaseFileCount: 18,
            units: [{ unitId: "onboarding", paths: ["lib/onboarding"], journeys: ["IDENTITY_ONBOARDING"] }],
            evidence: [...journeys.map(journey => evidence("WEB", journey)),
                ...journeys.slice(0, 2).map(journey => evidence("IOS", journey))] });
        expect(report.complete).toBe(false);
        expect(report.gaps.some(gap => gap.cip === "CIP-049" && gap.surface === "ANDROID")).toBe(true);
        expect(report.gaps.find(gap => gap.surface === "IOS" && gap.journey === "MESSAGING")?.missing).toContain("IMPLEMENTATION");
    });

    it("fails a visually complete journey that lacks durable governed data", () => {
        const report = new ApplicationReadinessCompiler().compile({ repository: "sgwalton87/playbook-platform", revision: "aa94b6d",
            branch: "main", routeCount: 1, testCount: 1, databaseFileCount: 1,
            units: [{ unitId: "dashboard", paths: ["app/dashboard"], journeys: ["DASHBOARD"] }],
            evidence: [{ ...evidence("WEB", "DASHBOARD"), usesDurableData: false, authorityAndProvenance: false }] });
        const gap = report.gaps.find(item => item.surface === "WEB" && item.journey === "DASHBOARD");
        expect(gap?.priority).toBe("CRITICAL");
        expect(gap?.missing).toContain("DURABLE_DATA");
        expect(gap?.missing).toContain("PBOS_AUTHORITY_AND_PROVENANCE");
    });

    it("blocks readiness when a repository unit is not mapped to a journey", () => {
        const report = new ApplicationReadinessCompiler().compile({ repository: "sgwalton87/playbook-platform", revision: "aa94b6d",
            branch: "main", routeCount: 1, testCount: 1, databaseFileCount: 1,
            units: [{ unitId: "unowned-engine", paths: ["lib/unowned-engine"], journeys: [] }], evidence: [] });
        expect(report.unmappedUnits).toEqual(["unowned-engine"]);
        expect(report.complete).toBe(false);
    });

    it("derives a conservative governed inventory without claiming unproven quality attributes", () => {
        const inventory = new RepositoryReadinessInventoryCompiler().compile({
            repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, revision: "5dda9e7",
            inspectedAt: new Date(), findings: [], files: [
                "src/app/dashboard/page.tsx", "tests/dashboard.test.tsx", "supabase/migrations/001_scholar.sql",
                "src/lib/unmapped-engine.ts"
            ]
        });
        const dashboard = inventory.evidence.find(item => item.journey === "DASHBOARD");
        expect(inventory).toMatchObject({ repository: "sgwalton87/playbook-platform", revision: "5dda9e7", routeCount: 1, testCount: 1, databaseFileCount: 1 });
        expect(dashboard).toMatchObject({ surface: "WEB", responsive: false, accessible: false });
        expect(inventory.units.some(unit => unit.unitId.includes("unmapped-engine") && unit.journeys.length === 0)).toBe(true);
    });
});
