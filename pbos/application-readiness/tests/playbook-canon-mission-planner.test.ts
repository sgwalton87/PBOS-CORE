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
    operatingSystems: [], onboardingPathways: [], productJourneyIds: [],
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
            dependencies: expect.arrayContaining(["048-canon-journeys", "048-canon-design", "048-phase-01-item-unfinished"]) });
        expect(items.find(item => item.missionId === "048-phase-01-item-unfinished")).toMatchObject({ status: "QUEUED",
            title: "Complete Phase 1 item: unfinished" });
        expect(items.find(item => item.missionId === "048-canon-requirements")?.status).toBe("COMPLETE");
        expect(items.find(item => item.missionId === "048-requirement-cmp-01")).toMatchObject({ status: "QUEUED",
            dependencies: ["048-canon-requirements"] });
        expect(items.find(item => item.missionId === "048-product-journeys")).toMatchObject({ status: "QUEUED",
            title: "Certify complete canon-converged Playbook product", evidenceIds: [] });
        expect(items.find(item => item.missionId === "048-web-staging")?.dependencies).toEqual(["048-product-journeys"]);
    });

    it("requires all product phases before platform QA and final product certification", () => {
        const items = new PlaybookCanonMissionPlanner().compile(graph);
        expect(items.find(item => item.missionId === "048-phase-15")?.dependencies)
            .toEqual(expect.arrayContaining(["048-phase-01", "048-phase-14", "048-phase-15-item-unfinished"]));
        expect(items.find(item => item.missionId === "048-product-journeys")?.dependencies)
            .toEqual(expect.arrayContaining(["048-canon-authority", "048-canon-journeys", "048-canon-design",
                "048-canon-requirements", "048-phase-01", "048-phase-15"]));
    });

    it("makes every canonical OS and onboarding pathway an explicit product dependency", () => {
        const fullGraph: PlaybookCanonProductGraph = { ...graph,
            operatingSystems: Array.from({ length: 17 }, (_, index) => ({ osId: `OS_${index + 1}`,
                label: `OS ${index + 1}`, route: `/os-${index + 1}`, routeImplemented: false,
                routeMapped: false, designBound: false })),
            onboardingPathways: Array.from({ length: 15 }, (_, index) => ({ pathwayId: `ROLE_${index + 1}`,
                label: `Role ${index + 1} onboarding`, operatingSystemId: `OS_${index + 1}`, status: "MISSING" })) };
        const items = new PlaybookCanonMissionPlanner().compile(fullGraph);
        expect(items.filter(item => item.missionId.startsWith("048-os-"))).toHaveLength(17);
        expect(items.filter(item => item.missionId.startsWith("048-onboarding-"))).toHaveLength(15);
        const product = items.find(item => item.missionId === "048-product-journeys");
        expect(product?.dependencies).toEqual(expect.arrayContaining([
            "048-os-os-1", "048-os-os-17", "048-onboarding-role-1", "048-onboarding-role-15"
        ]));
    });

    it("surfaces role/OS blockers and product-domain hotspots in actionable rationale", () => {
        const detailed: PlaybookCanonProductGraph = {
            ...graph,
            requirements: [{ requirementId: "CMP-01", requirement: "Compass feed onboarding and messaging with Starting 5 support.",
                status: "PARTIAL", sourcePath: "trace.md" },
            { requirementId: "MOB-01", requirement: "TestFlight and Google Play store readiness wiring remains partial.",
                status: "PARTIAL", sourcePath: "trace.md" }],
            blockers: [
                "ROLE_JOURNEY_INCOMPLETE:Scholar:PARTIAL",
                "ROLE_OS_ROUTE_UNMAPPED:Scholar:/onboarding",
                "ROLE_OS_ROUTE_NOT_DECLARED_IN_OS_SCOPE:Scholar:/onboarding",
                "ROLE_OS_ROUTE_DESIGN_CANON_MISSING:Scholar:/onboarding",
                "CANON_OS_SCOPE_ROUTES_UNAVAILABLE",
                "REQUIREMENT_PARTIAL:CMP-01"
            ]
        };
        const items = new PlaybookCanonMissionPlanner().compile(detailed);
        expect(items.find(item => item.missionId === "048-canon-journeys")?.rationale)
            .toContain("Incomplete roles: Scholar (PARTIAL)");
        const designRationale = items.find(item => item.missionId === "048-canon-design")?.rationale ?? "";
        expect(designRationale).toContain("Role OS routes unmapped: Scholar -> /onboarding");
        expect(designRationale).toContain("outside declared OS scope");
        expect(designRationale).toContain("Canonical OS scope routes are unavailable");
        const requirementRationale = items.find(item => item.missionId === "048-canon-requirements")?.rationale ?? "";
        expect(requirementRationale).toContain("Priority domains blocked");
        expect(requirementRationale).toContain("Compass");
        expect(requirementRationale).toContain("Newsfeed");
        expect(requirementRationale).toContain("Messaging");
        expect(requirementRationale).toContain("Onboarding");
        expect(requirementRationale).toContain("Starting 5 support");
        expect(requirementRationale).toContain("Store readiness");

        const compassPackage = items.find(item => item.missionId === "048-domain-compass");
        expect(compassPackage).toMatchObject({ title: "Compass readiness package", dependencies: ["048-requirement-cmp-01"] });
        const starting5Package = items.find(item => item.missionId === "048-domain-starting-5");
        expect(starting5Package).toMatchObject({ title: "Starting 5 onboarding persistence package" });
        const storePackage = items.find(item => item.missionId === "048-domain-store");
        expect(storePackage).toMatchObject({ title: "Store wiring package" });

        expect(items.find(item => item.missionId === "048-product-journeys")?.dependencies)
            .toEqual(expect.arrayContaining(["048-domain-compass", "048-domain-newsfeed", "048-domain-messaging",
                "048-domain-onboarding", "048-domain-starting-5", "048-domain-store"]));
    });
});
