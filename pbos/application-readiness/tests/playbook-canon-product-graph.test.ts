import { describe, expect, it } from "vitest";
import { PLAYBOOK_CANON_SOURCES, PlaybookCanonProductGraphCompiler, PlaybookCanonSource } from "../playbook-canon-product-graph";
import { PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS, PLAYBOOK_CANONICAL_OPERATING_SYSTEMS,
    PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS } from "../playbook-full-canonical-roadmap";

const completeSources = (): PlaybookCanonSource[] => PLAYBOOK_CANON_SOURCES.map(path => ({ path, content: "Canonical authority." }));

describe("Playbook canon-to-product graph", () => {
    const osScope = "# Playbook Operating Systems\n## Scholar OS\n- Landing route: `/dashboard`";
    const roleJourneys = [
        "# User Journeys",
        "",
        "## Role journey index",
        "",
        "| Role | Signup | Onboarding | OS landing | Permissions | Verification | Current status |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| Scholar | Email signup | Guided onboarding | `/dashboard` | Scoped scholar authority | Consent verified | COMPLETE |"
    ].join("\n");

    it("fails closed for the real classes of false completion PBOS previously ignored", () => {
        const sources = completeSources().map(source => source.path === "docs/MASTER_CHECKLIST.md"
            ? { ...source, content: "# Phase 1 — Identity\n**Completion:** 41%\n- 🟦 Google Login" }
            : source.path === "docs/USER_JOURNEYS.md" ? { ...source, content: "# User Journeys\n" }
            : source.path === "pbos/readiness/048-canon-journeys.json" ? { ...source, content: '{"governedRevision":"abc1234","productJourneys":[]}' }
            : source.path === "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md"
                ? { ...source, content: "| CMP-01 | Compass consumes Scholar data | Partial | demo input | durable projection missing |" }
                : source.path === "docs/design/CANONICAL_ROUTE_MAP.md"
                    ? { ...source, content: "| Dashboard | `/dashboard` | `app/dashboard/page.tsx` | shell | Active | none | dashboard | none |" }
                    : source);
        const graph = new PlaybookCanonProductGraphCompiler().compile("abc1234",
            ["app/dashboard/page.tsx", "app/compass/page.tsx"], sources);
        expect(graph.certificationReady).toBe(false);
        expect(graph.blockers).toContain("CANON_USER_JOURNEYS_EMPTY");
        expect(graph.blockers).toContain("CANON_PRODUCT_JOURNEYS_EMPTY");
        expect(graph.blockers).toContain("PRODUCT_PHASE_INCOMPLETE:PHASE-01:41");
        expect(graph.blockers).toContain("REQUIREMENT_PARTIAL:CMP-01");
        expect(graph.blockers).toContain("VISIBLE_ROUTE_UNMAPPED:/compass");
        expect(graph.blockers).toContain("VISIBLE_ROUTE_DESIGN_CANON_MISSING:/dashboard");
    });

    it("counts every multi-codepoint checklist status marker as unfinished", () => {
        const sources = completeSources().map(source => source.path === "docs/MASTER_CHECKLIST.md"
            ? { ...source, content: "# Phase 1 — Identity\n**Completion:** 20%\n- ⬜ Not started\n- 🟨 In progress\n- 🟦 Testing\n- 🟥 Needs fix\n- 🟩 Complete" }
            : source.path === "docs/USER_JOURNEYS.md" ? { ...source, content: roleJourneys }
            : source.path === "pbos/readiness/048-canon-journeys.json" ? { ...source, content: '{"governedRevision":"abc1234","productJourneys":[]}' }
            : source);
        const graph = new PlaybookCanonProductGraphCompiler().compile("abc1234", [], sources);
        expect(graph.phases[0]?.incompleteItems).toEqual(["Not started", "In progress", "Testing", "Needs fix"]);
    });

    it("can become certification-ready only when canon, product, route, and design evidence all converge", () => {
        const roleByPathway: Readonly<Record<string, string>> = {
            SCHOLAR: "Scholar", SCHOLAR_ATHLETE: "Scholar-Athlete", PARENT_GUARDIAN: "Family",
            TEACHER_EDUCATOR: "Educator", HIGH_SCHOOL_COUNSELOR: "High School Counselor", MENTOR: "Mentor",
            HIGH_SCHOOL_COACH: "High School Coach", COLLEGE_COACH_RECRUITER: "College Coach / Recruiter",
            COLLEGE_ADMISSIONS: "College Admissions Officer", BRAND_PARTNER: "Brand Partner", EMPLOYER: "Employer",
            TRANSITION_AGED_YOUTH: "Transition-Aged Youth", ATHLETES_ABROAD: "Athletes Abroad",
            DISTRICT_SCHOOL_ADMIN: "District / School Administrator", COMMUNITY_PARTNER: "Community Partner"
        };
        const completeRoleJourneys = ["# User Journeys", "", "## Role journey index", "",
            "| Role | Signup | Onboarding | OS landing | Permissions | Verification | Current status |",
            "| --- | --- | --- | --- | --- | --- | --- |",
            ...PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.map(pathway => {
                const os = PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.find(item => item.osId === pathway.operatingSystemId)!;
                return `| ${roleByPathway[pathway.pathwayId]} | Complete | Complete | \`${os.route}\` | Complete | Complete | COMPLETE |`;
            })].join("\n");
        const uniqueOperatingRoutes = [...new Set(PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.map(item => item.route))];
        const trackedFiles = uniqueOperatingRoutes.map(route => route === "/" ? "app/page.tsx" : `app${route}/page.tsx`);
        const routeMap = uniqueOperatingRoutes.map((route, index) =>
            `| OS ${index + 1} | \`${route}\` | \`${route === "/" ? "app/page.tsx" : `app${route}/page.tsx`}\` | shell | PGOS-${String(index + 1).padStart(3, "0")} implemented | none | route | none |`).join("\n");
        const sources = completeSources().map(source => source.path === "docs/MASTER_CHECKLIST.md"
            ? { ...source, content: Array.from({ length: 15 }, (_, index) =>
                `# Phase ${index + 1} — Phase ${index + 1}\n**Completion:** 100%`).join("\n") }
            : source.path === "docs/USER_JOURNEYS.md" ? { ...source, content: completeRoleJourneys }
            : source.path === "docs/PLAYBOOK_OS.md" ? { ...source, content: uniqueOperatingRoutes.map(route => `- \`${route}\``).join("\n") }
            : source.path === "pbos/readiness/048-canon-journeys.json" ? { ...source,
                content: JSON.stringify({ governedRevision: "abc1234",
                    productJourneys: PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS.map(journeyId => ({ journeyId })) }) }
            : source.path === "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md"
                ? { ...source, content: "| CMP-01 | Compass consumes Scholar data | Existing | implementation | none |" }
                : source.path === "docs/design/CANONICAL_ROUTE_MAP.md"
                    ? { ...source, content: routeMap }
                    : source);
        const graph = new PlaybookCanonProductGraphCompiler().compile("abc1234", trackedFiles, sources);
        expect(graph).toMatchObject({ certificationReady: true, blockers: [] });
        expect(graph.operatingSystems).toHaveLength(17);
        expect(graph.onboardingPathways).toHaveLength(15);
        expect(graph.productJourneyIds).toHaveLength(32);
    });

    it("fails closed when canonical product journey manifest is malformed", () => {
        const sources = completeSources().map(source => source.path === "docs/MASTER_CHECKLIST.md"
            ? { ...source, content: Array.from({ length: 15 }, (_, index) =>
                `# Phase ${index + 1} — Phase ${index + 1}\n**Completion:** 100%`).join("\n") }
            : source.path === "docs/USER_JOURNEYS.md" ? { ...source, content: roleJourneys }
            : source.path === "docs/PLAYBOOK_OS.md" ? { ...source, content: osScope }
            : source.path === "pbos/readiness/048-canon-journeys.json" ? { ...source, content: "{not-json" }
            : source.path === "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md"
                ? { ...source, content: "| CMP-01 | Compass consumes Scholar data | Existing | implementation | none |" }
                : source.path === "docs/design/CANONICAL_ROUTE_MAP.md"
                    ? { ...source, content: "| Dashboard | `/dashboard` | `app/dashboard/page.tsx` | shell | PGSL-007 implemented | none | dashboard | none |" }
                    : source);
        const graph = new PlaybookCanonProductGraphCompiler().compile("abc1234", ["app/dashboard/page.tsx"], sources);
        expect(graph.blockers).toContain("CANON_PRODUCT_JOURNEYS_JSON_INVALID");
        expect(graph.blockers).toContain("CANON_PRODUCT_JOURNEYS_EMPTY");
    });

    it("fails closed when canonical product journeys include invalid types, formats, or duplicates", () => {
        const sources = completeSources().map(source => source.path === "docs/MASTER_CHECKLIST.md"
            ? { ...source, content: Array.from({ length: 15 }, (_, index) =>
                `# Phase ${index + 1} — Phase ${index + 1}\n**Completion:** 100%`).join("\n") }
            : source.path === "docs/USER_JOURNEYS.md" ? { ...source, content: roleJourneys }
            : source.path === "docs/PLAYBOOK_OS.md" ? { ...source, content: osScope }
            : source.path === "pbos/readiness/048-canon-journeys.json"
                ? { ...source, content: '{"governedRevision":"abc1234","productJourneys":[{"journeyId":"SCHOLAR-ONBOARDING-TO-DASHBOARD"},{"journeyId":42},{"journeyId":"Transcript to Academic Readiness"},{"journeyId":"SCHOLAR-ONBOARDING-TO-DASHBOARD"}]}' }
            : source.path === "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md"
                ? { ...source, content: "| CMP-01 | Compass consumes Scholar data | Existing | implementation | none |" }
                : source.path === "docs/design/CANONICAL_ROUTE_MAP.md"
                    ? { ...source, content: "| Dashboard | `/dashboard` | `app/dashboard/page.tsx` | shell | PGSL-007 implemented | none | dashboard | none |" }
                    : source);
        const graph = new PlaybookCanonProductGraphCompiler().compile("abc1234", ["app/dashboard/page.tsx"], sources);
        expect(graph.blockers).toContain("CANON_PRODUCT_JOURNEY_ID_TYPE_INVALID:1");
        expect(graph.blockers).toContain("CANON_PRODUCT_JOURNEY_ID_FORMAT_INVALID:Transcript to Academic Readiness");
        expect(graph.blockers).toContain("CANON_PRODUCT_JOURNEYS_DUPLICATE:SCHOLAR-ONBOARDING-TO-DASHBOARD");
    });

    it("fails closed when OS scope or role-specific journey authority is incomplete", () => {
        const sources = completeSources().map(source => source.path === "docs/MASTER_CHECKLIST.md"
            ? { ...source, content: Array.from({ length: 15 }, (_, index) =>
                `# Phase ${index + 1} — Phase ${index + 1}\n**Completion:** 100%`).join("\n") }
            : source.path === "docs/USER_JOURNEYS.md"
                ? { ...source, content: "# User Journeys\n## Role journey index\n| Role | Signup | Onboarding | OS landing | Permissions | Verification | Current status |\n| --- | --- | --- | --- | --- | --- | --- |\n| Scholar | Signup | Onboarding | `/unmapped-os` | Scoped authority | Verified | PARTIAL |" }
            : source.path === "docs/PLAYBOOK_OS.md" ? { ...source, content: "# Playbook Operating Systems\n## Scholar OS\n- Landing route: `/dashboard`" }
            : source.path === "pbos/readiness/048-canon-journeys.json" ? { ...source, content: '{"productJourneys":[{"journeyId":"SCHOLAR-ONBOARDING-TO-DASHBOARD"}]}' }
            : source.path === "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md"
                ? { ...source, content: "| CMP-01 | Compass consumes Scholar data | Existing | implementation | none |" }
                : source.path === "docs/design/CANONICAL_ROUTE_MAP.md"
                    ? { ...source, content: "| Dashboard | `/dashboard` | `app/dashboard/page.tsx` | shell | PGSL-007 implemented | none | dashboard | none |" }
                    : source);
        const graph = new PlaybookCanonProductGraphCompiler().compile("abc1234", ["app/dashboard/page.tsx"], sources);
        expect(graph.blockers).toContain("ROLE_JOURNEY_INCOMPLETE:Scholar:PARTIAL");
        expect(graph.blockers).toContain("ROLE_OS_ROUTE_UNMAPPED:Scholar:/unmapped-os");
        expect(graph.blockers).toContain("ROLE_OS_ROUTE_NOT_DECLARED_IN_OS_SCOPE:Scholar:/unmapped-os");
    });

    it("requires a valid compiled-from revision without demanding an impossible self-referential commit hash", () => {
        const stale = completeSources().map(source => source.path === "docs/MASTER_CHECKLIST.md"
            ? { ...source, content: Array.from({ length: 15 }, (_, index) =>
                `# Phase ${index + 1} — Phase ${index + 1}\n**Completion:** 100%`).join("\n") }
            : source.path === "docs/USER_JOURNEYS.md" ? { ...source, content: roleJourneys }
            : source.path === "docs/PLAYBOOK_OS.md" ? { ...source, content: osScope }
            : source.path === "pbos/readiness/048-canon-journeys.json"
                ? { ...source, content: '{"governedRevision":"deadbeef","productJourneys":[{"journeyId":"SCHOLAR-ONBOARDING-TO-DASHBOARD"}]}' }
            : source.path === "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md"
                ? { ...source, content: "| CMP-01 | Compass consumes Scholar data | Existing | implementation | none |" }
                : source.path === "docs/design/CANONICAL_ROUTE_MAP.md"
                    ? { ...source, content: "| Dashboard | `/dashboard` | `app/dashboard/page.tsx` | shell | PGSL-007 implemented | none | dashboard | none |" }
                    : source);
        const staleGraph = new PlaybookCanonProductGraphCompiler().compile("abc1234", ["app/dashboard/page.tsx"], stale);
        expect(staleGraph.blockers).not.toContain("CANON_PRODUCT_JOURNEYS_STALE:deadbeef");

        const missing = completeSources().map(source => source.path === "docs/MASTER_CHECKLIST.md"
            ? { ...source, content: Array.from({ length: 15 }, (_, index) =>
                `# Phase ${index + 1} — Phase ${index + 1}\n**Completion:** 100%`).join("\n") }
            : source.path === "docs/USER_JOURNEYS.md" ? { ...source, content: roleJourneys }
            : source.path === "docs/PLAYBOOK_OS.md" ? { ...source, content: osScope }
            : source.path === "pbos/readiness/048-canon-journeys.json"
                ? { ...source, content: '{"productJourneys":[{"journeyId":"SCHOLAR-ONBOARDING-TO-DASHBOARD"}]}' }
            : source.path === "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md"
                ? { ...source, content: "| CMP-01 | Compass consumes Scholar data | Existing | implementation | none |" }
                : source.path === "docs/design/CANONICAL_ROUTE_MAP.md"
                    ? { ...source, content: "| Dashboard | `/dashboard` | `app/dashboard/page.tsx` | shell | PGSL-007 implemented | none | dashboard | none |" }
                    : source);
        const missingGraph = new PlaybookCanonProductGraphCompiler().compile("abc1234", ["app/dashboard/page.tsx"], missing);
        expect(missingGraph.blockers).toContain("CANON_PRODUCT_JOURNEYS_REVISION_MISSING");
    });
});
