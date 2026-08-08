import { describe, expect, it } from "vitest";
import { PlaybookCanonMissionPlanner } from "../playbook-canon-mission-planner";
import { PlaybookCanonProductGraph } from "../playbook-canon-product-graph";

const graph: PlaybookCanonProductGraph = { schemaVersion: 1, repository: "sgwalton87/playbook-platform", revision: "abcdef1",
    sources: [{ path: "CODEX.md", contentLength: 10, sha256: "a".repeat(64) }],
    phases: Array.from({ length: 15 }, (_, index) => ({ phaseId: `PHASE-${String(index + 1).padStart(2, "0")}`,
        title: `Phase ${index + 1}`, completion: index === 0 ? 41 : 0, incompleteItems: ["unfinished"] })),
    requirements: [{ requirementId: "CMP-01", requirement: "Compass", status: "PARTIAL", sourcePath: "trace.md" }],
    routes: [{ route: "/dashboard", implementationPath: "app/dashboard/page.tsx", canonStatus: "MAPPED", designCanonIds: [] },
        { route: "/feed", implementationPath: "app/feed/page.tsx", canonStatus: "UNMAPPED", designCanonIds: [] }],
    blockers: ["CANON_USER_JOURNEYS_EMPTY", "PRODUCT_PHASE_INCOMPLETE:PHASE-01:41", "REQUIREMENT_PARTIAL:CMP-01",
        "VISIBLE_ROUTE_DESIGN_CANON_MISSING:/dashboard", "VISIBLE_ROUTE_UNMAPPED:/feed"], certificationReady: false };

describe("Playbook canon mission planner", () => {
    it("replaces false whole-product completion with dependency-ordered canon missions", () => {
        const items = new PlaybookCanonMissionPlanner().compile(graph, [{ missionId: "048-product-journeys",
            systemId: "PLAYBOOK-SYSTEM-001", title: "Old seven-journey aggregate", dependencies: [], status: "COMPLETE",
            rationale: "stale", approvalRequired: true, evidenceIds: ["stale"] }]);
        expect(items.find(item => item.missionId === "048-canon-authority")?.status).toBe("COMPLETE");
        expect(items.find(item => item.missionId === "048-canon-journeys")?.status).toBe("QUEUED");
        expect(items.find(item => item.missionId === "048-phase-01")).toMatchObject({ status: "QUEUED",
            dependencies: expect.arrayContaining(["048-canon-journeys", "048-canon-design"]) });
        expect(items.find(item => item.missionId === "048-product-journeys")).toMatchObject({ status: "QUEUED",
            title: "Certify complete canon-converged Playbook product", evidenceIds: [] });
        expect(items.find(item => item.missionId === "048-web-staging")?.dependencies).toEqual(["048-product-journeys"]);
    });

    it("requires all product phases before platform QA and final product certification", () => {
        const items = new PlaybookCanonMissionPlanner().compile(graph);
        expect(items.find(item => item.missionId === "048-phase-15")?.dependencies)
            .toEqual(expect.arrayContaining(["048-phase-01", "048-phase-14"]));
        expect(items.find(item => item.missionId === "048-product-journeys")?.dependencies)
            .toEqual(expect.arrayContaining(["048-canon-authority", "048-canon-journeys", "048-canon-design",
                "048-canon-requirements", "048-phase-01", "048-phase-15"]));
    });
});
