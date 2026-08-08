import { createHash } from "node:crypto";

export type PlaybookCanonStatus = "IMPLEMENTED" | "PARTIAL" | "MISSING" | "BLOCKED";

export interface PlaybookCanonSource {
    readonly path: string;
    readonly content: string;
}

export interface PlaybookCanonRequirement {
    readonly requirementId: string;
    readonly requirement: string;
    readonly status: PlaybookCanonStatus;
    readonly sourcePath: string;
}

export interface PlaybookCanonPhase {
    readonly phaseId: string;
    readonly title: string;
    readonly completion: number;
    readonly incompleteItems: readonly string[];
}

export interface PlaybookCanonRoute {
    readonly route: string;
    readonly implementationPath: string;
    readonly feature?: string;
    readonly canonStatus: "MAPPED" | "UNMAPPED";
    readonly designCanonIds: readonly string[];
}

export interface PlaybookCanonProductGraph {
    readonly schemaVersion: 1;
    readonly repository: "sgwalton87/playbook-platform";
    readonly revision: string;
    readonly sources: readonly Readonly<{ path: string; contentLength: number; sha256: string }>[];
    readonly phases: readonly PlaybookCanonPhase[];
    readonly requirements: readonly PlaybookCanonRequirement[];
    readonly routes: readonly PlaybookCanonRoute[];
    readonly blockers: readonly string[];
    readonly certificationReady: boolean;
}

export const PLAYBOOK_CANON_SOURCES = [
    "CODEX.md",
    "AGENTS.md",
    "docs/MASTER_CHECKLIST.md",
    "docs/ROADMAP.md",
    "docs/ARCHITECTURE.md",
    "docs/DATABASE.md",
    "docs/UI_DESIGN_SYSTEM.md",
    "docs/DECISIONS.md",
    "docs/RELEASE_PROCESS.md",
    "docs/auto_sprint.md",
    "docs/PLAYBOOK_NORTH_STAR.md",
    "docs/PLAYBOOK_CONSTITUTION.md",
    "docs/PLAYBOOK_OS.md",
    "docs/USER_JOURNEYS.md",
    "docs/design/CANONICAL_ROUTE_MAP.md",
    "docs/design/PLAYBOOK_DESIGN_SYSTEM.md",
    "docs/design/FUNCTIONAL_WIRING_BACKLOG.md",
    "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md"
] as const;

const normalizeStatus = (value: string): PlaybookCanonStatus => {
    const normalized = value.trim().toUpperCase();
    if (normalized === "EXISTING" || normalized === "IMPLEMENTED" || normalized === "COMPLETE") return "IMPLEMENTED";
    if (normalized === "PARTIAL" || normalized === "IN PROGRESS" || normalized === "TESTING") return "PARTIAL";
    if (normalized === "MISSING" || normalized === "NOT STARTED") return "MISSING";
    return "BLOCKED";
};

const routeFromPage = (path: string): string => {
    const route = path.replace(/^app/, "").replace(/\/page\.(tsx?|jsx?)$/, "") || "/";
    return route.replace(/\/\([^/]+\)/g, "");
};

function parsePhases(source: string): readonly PlaybookCanonPhase[] {
    const headings = [...source.matchAll(/^# (Phase (\d+) — ([^\n]+))$/gm)];
    return headings.map((match, index) => {
        const body = source.slice((match.index ?? 0) + match[0].length, headings[index + 1]?.index ?? source.length);
        const completion = Number(body.match(/^\*\*Completion:\*\*\s*(\d+)%/m)?.[1] ?? 0);
        const incompleteItems = [...body.matchAll(/^- ([⬜🟨🟦🟥])\s+(.+)$/gm)].map(item => item[2].trim());
        return { phaseId: `PHASE-${match[2].padStart(2, "0")}`, title: match[3].trim(), completion, incompleteItems };
    });
}

function parseRequirements(source: string): readonly PlaybookCanonRequirement[] {
    const requirements: PlaybookCanonRequirement[] = [];
    for (const line of source.split(/\r?\n/)) {
        const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
        if (cells.length < 3 || !/^[A-Z]{3,5}-\d{2}$/.test(cells[0])) continue;
        requirements.push({ requirementId: cells[0], requirement: cells[1], status: normalizeStatus(cells[2]),
            sourcePath: "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md" });
    }
    return requirements;
}

function parseRouteMap(source: string): ReadonlyMap<string, Readonly<{ feature: string; path: string; designCanonIds: readonly string[] }>> {
    const routes = new Map<string, Readonly<{ feature: string; path: string; designCanonIds: readonly string[] }>>();
    for (const line of source.split(/\r?\n/)) {
        const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
        if (cells.length < 7) continue;
        const route = cells[1].match(/`(\/[^`]*)`/)?.[1];
        const path = cells[2].match(/`([^`]+)`/)?.[1];
        if (!route || !path) continue;
        const designCanonIds = [...line.matchAll(/\b(PG[A-Z]+-\d{3})\b/g)].map(match => match[1]);
        routes.set(route, { feature: cells[0], path, designCanonIds });
    }
    return routes;
}

/**
 * Compiles the product truth PBOS must use before it can aggregate or certify The Playbook.
 * It intentionally fails closed: documentation presence, route existence, and a green build
 * are evidence inputs, never substitutes for complete product behavior.
 */
export class PlaybookCanonProductGraphCompiler {
    compile(revision: string, trackedFiles: readonly string[], providedSources: readonly PlaybookCanonSource[]): PlaybookCanonProductGraph {
        const sourceByPath = new Map(providedSources.map(source => [source.path, source.content]));
        const blockers: string[] = [];
        for (const path of PLAYBOOK_CANON_SOURCES) {
            const content = sourceByPath.get(path);
            if (content === undefined) blockers.push(`CANON_SOURCE_MISSING:${path}`);
            else if (!content.trim()) blockers.push(`CANON_SOURCE_EMPTY:${path}`);
        }

        const master = sourceByPath.get("docs/MASTER_CHECKLIST.md") ?? "";
        const phases = parsePhases(master);
        if (!phases.length) blockers.push("PRODUCT_PHASES_UNAVAILABLE");
        for (let index = 1; index <= 15; index += 1) {
            const phaseId = `PHASE-${String(index).padStart(2, "0")}`;
            if (!phases.some(phase => phase.phaseId === phaseId)) blockers.push(`PRODUCT_PHASE_MISSING:${phaseId}`);
        }
        phases.forEach(phase => {
            if (phase.completion < 100 || phase.incompleteItems.length) {
                blockers.push(`PRODUCT_PHASE_INCOMPLETE:${phase.phaseId}:${phase.completion}`);
            }
        });

        const userJourneys = (sourceByPath.get("docs/USER_JOURNEYS.md") ?? "").replace(/^# User Journeys\s*/i, "").trim();
        if (!userJourneys) blockers.push("CANON_USER_JOURNEYS_EMPTY");

        const requirements = parseRequirements(sourceByPath.get("docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md") ?? "");
        if (!requirements.length) blockers.push("PRODUCT_REQUIREMENTS_UNAVAILABLE");
        requirements.filter(requirement => requirement.status !== "IMPLEMENTED")
            .forEach(requirement => blockers.push(`REQUIREMENT_${requirement.status}:${requirement.requirementId}`));

        const routeMap = parseRouteMap(sourceByPath.get("docs/design/CANONICAL_ROUTE_MAP.md") ?? "");
        const visiblePageFiles = trackedFiles.filter(path => /^app\/(?!api\/).+\/page\.(tsx?|jsx?)$/.test(path) || /^app\/page\.(tsx?|jsx?)$/.test(path));
        const routes = visiblePageFiles.map(implementationPath => {
            const route = routeFromPage(implementationPath);
            const mapped = routeMap.get(route);
            return { route, implementationPath, feature: mapped?.feature, canonStatus: mapped ? "MAPPED" as const : "UNMAPPED" as const,
                designCanonIds: mapped?.designCanonIds ?? [] };
        }).sort((left, right) => left.route.localeCompare(right.route));
        routes.filter(route => route.canonStatus === "UNMAPPED")
            .forEach(route => blockers.push(`VISIBLE_ROUTE_UNMAPPED:${route.route}`));
        routes.filter(route => route.canonStatus === "MAPPED" && !route.designCanonIds.length)
            .forEach(route => blockers.push(`VISIBLE_ROUTE_DESIGN_CANON_MISSING:${route.route}`));

        const uniqueBlockers = [...new Set(blockers)].sort();
        return { schemaVersion: 1, repository: "sgwalton87/playbook-platform", revision,
            sources: PLAYBOOK_CANON_SOURCES.map(path => { const content = sourceByPath.get(path) ?? ""; return {
                path, contentLength: content.length, sha256: createHash("sha256").update(content).digest("hex") }; }),
            phases, requirements, routes, blockers: uniqueBlockers, certificationReady: uniqueBlockers.length === 0 };
    }
}
