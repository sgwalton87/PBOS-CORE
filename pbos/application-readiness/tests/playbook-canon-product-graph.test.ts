import { describe, expect, it } from "vitest";
import { PLAYBOOK_CANON_SOURCES, PlaybookCanonProductGraphCompiler, PlaybookCanonSource } from "../playbook-canon-product-graph";

const completeSources = (): PlaybookCanonSource[] => PLAYBOOK_CANON_SOURCES.map(path => ({ path, content: "Canonical authority." }));

describe("Playbook canon-to-product graph", () => {
    it("fails closed for the real classes of false completion PBOS previously ignored", () => {
        const sources = completeSources().map(source => source.path === "docs/MASTER_CHECKLIST.md"
            ? { ...source, content: "# Phase 1 — Identity\n**Completion:** 41%\n- 🟦 Google Login" }
            : source.path === "docs/USER_JOURNEYS.md" ? { ...source, content: "# User Journeys\n" }
            : source.path === "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md"
                ? { ...source, content: "| CMP-01 | Compass consumes Scholar data | Partial | demo input | durable projection missing |" }
                : source.path === "docs/design/CANONICAL_ROUTE_MAP.md"
                    ? { ...source, content: "| Dashboard | `/dashboard` | `app/dashboard/page.tsx` | shell | Active | none | dashboard | none |" }
                    : source);
        const graph = new PlaybookCanonProductGraphCompiler().compile("abc1234",
            ["app/dashboard/page.tsx", "app/compass/page.tsx"], sources);
        expect(graph.certificationReady).toBe(false);
        expect(graph.blockers).toContain("CANON_USER_JOURNEYS_EMPTY");
        expect(graph.blockers).toContain("PRODUCT_PHASE_INCOMPLETE:PHASE-01:41");
        expect(graph.blockers).toContain("REQUIREMENT_PARTIAL:CMP-01");
        expect(graph.blockers).toContain("VISIBLE_ROUTE_UNMAPPED:/compass");
        expect(graph.blockers).toContain("VISIBLE_ROUTE_DESIGN_CANON_MISSING:/dashboard");
    });

    it("can become certification-ready only when canon, product, route, and design evidence all converge", () => {
        const sources = completeSources().map(source => source.path === "docs/MASTER_CHECKLIST.md"
            ? { ...source, content: Array.from({ length: 15 }, (_, index) =>
                `# Phase ${index + 1} — Phase ${index + 1}\n**Completion:** 100%`).join("\n") }
            : source.path === "docs/USER_JOURNEYS.md" ? { ...source, content: "# User Journeys\n## Scholar\nScholar signs in and reaches the dashboard." }
            : source.path === "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md"
                ? { ...source, content: "| CMP-01 | Compass consumes Scholar data | Existing | implementation | none |" }
                : source.path === "docs/design/CANONICAL_ROUTE_MAP.md"
                    ? { ...source, content: "| Dashboard | `/dashboard` | `app/dashboard/page.tsx` | shell | PGSL-007 implemented | none | dashboard | none |" }
                    : source);
        const graph = new PlaybookCanonProductGraphCompiler().compile("abc1234", ["app/dashboard/page.tsx"], sources);
        expect(graph).toMatchObject({ certificationReady: true, blockers: [] });
        expect(graph.routes[0]).toMatchObject({ route: "/dashboard", designCanonIds: ["PGSL-007"] });
    });
});
