import { createHash } from "node:crypto";
import { assertPlaybookFullCanonicalRoadmap, PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS,
    PLAYBOOK_CANONICAL_OPERATING_SYSTEMS, PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS } from "./playbook-full-canonical-roadmap";

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

export interface PlaybookCanonRoleJourney {
    readonly role: string;
    readonly osRoute?: string;
    readonly status: string;
}

export interface PlaybookCanonOperatingSystem {
    readonly osId: string;
    readonly label: string;
    readonly route: string;
    readonly routeImplemented: boolean;
    readonly routeMapped: boolean;
    readonly designBound: boolean;
}

export interface PlaybookCanonOnboardingPathway {
    readonly pathwayId: string;
    readonly label: string;
    readonly operatingSystemId: string;
    readonly roleJourney?: string;
    readonly status: string;
}

export interface PlaybookCanonProductGraph {
    readonly schemaVersion: 1;
    readonly repository: "sgwalton87/playbook-platform";
    readonly revision: string;
    readonly sources: readonly Readonly<{ path: string; contentLength: number; sha256: string }>[];
    readonly phases: readonly PlaybookCanonPhase[];
    readonly requirements: readonly PlaybookCanonRequirement[];
    readonly routes: readonly PlaybookCanonRoute[];
    readonly operatingSystems: readonly PlaybookCanonOperatingSystem[];
    readonly onboardingPathways: readonly PlaybookCanonOnboardingPathway[];
    readonly productJourneyIds: readonly string[];
    readonly blockers: readonly string[];
    readonly certificationReady: boolean;
}

export const PLAYBOOK_CANON_SOURCES = [
    "CODEX.md",
    "AGENTS.md",
    "docs/MASTER_CHECKLIST.md",
    "docs/ROADMAP.md",
    "docs/ARCHITECTURE.md",
    "docs/PLAYBOOK_MASTER_CHECKLIST.md",
    "docs/DATABASE.md",
    "docs/UI_DESIGN_SYSTEM.md",
    "docs/DECISIONS.md",
    "docs/RELEASE_PROCESS.md",
    "docs/auto_sprint.md",
    "docs/PLAYBOOK_NORTH_STAR.md",
    "docs/PLAYBOOK_CONSTITUTION.md",
    "docs/PLAYBOOK_OS.md",
    "docs/USER_JOURNEYS.md",
    "docs/GOVERNANCE/ROLE_REGISTRY.md",
    "docs/ONBOARDING_ROLE_OS_SPRINT_MAP.md",
    "docs/PLATFORM_FUNCTIONAL_AUDIT.md",
    "pbos/readiness/048-canon-journeys.json",
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
        const incompleteItems = [...body.matchAll(/^- (⬜️?|🟨|🟦|🟥)\s+(.+)$/gmu)].map(item => item[2].trim());
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
        const designCanonIds = [...line.matchAll(/\b(P[A-Z]{3}-\d{3})\b/g)].map(match => match[1]);
        routes.set(route, { feature: cells[0], path, designCanonIds });
    }
    return routes;
}

function routesFromCell(value: string): readonly string[] {
    const markdownRoute = value.match(/`(\/[A-Za-z0-9/_-]*)`/)?.[1];
    if (markdownRoute) return [markdownRoute];
    return [...new Set([...value.matchAll(/(\/[a-z0-9][a-z0-9/_-]*)/g)].map(match => match[1])
        .filter(route => !["/navigation", "/onboarding"].includes(route)))];
}

function parseRoleJourneys(source: string): Readonly<{ roles: readonly PlaybookCanonRoleJourney[]; blockers: readonly string[] }> {
    const section = source.split(/^## Role journey index$/m)[1]?.split(/^## /m)[0] ?? "";
    const roles: PlaybookCanonRoleJourney[] = [];
    const blockers: string[] = [];
    for (const line of section.split(/\r?\n/)) {
        if (!line.startsWith("|")) continue;
        const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
        if (cells.length !== 7 || cells[0] === "Role" || /^-+$/.test(cells[0])) continue;
        const candidateRoutes = routesFromCell(cells[3]);
        const osRoute = candidateRoutes[0];
        if (!osRoute) blockers.push(`CANON_ROLE_JOURNEY_OS_ROUTE_INVALID:${cells[0]}`);
        if (candidateRoutes.length > 1) blockers.push(`CANON_ROLE_JOURNEY_OS_ROUTE_AMBIGUOUS:${cells[0]}:${candidateRoutes.join(",")}`);
        roles.push({ role: cells[0], osRoute, status: cells[6].toUpperCase() });
    }
    if (!roles.length) blockers.push("CANON_ROLE_JOURNEYS_UNAVAILABLE");
    return { roles, blockers };
}

function roleJourneyBlockers(roles: readonly PlaybookCanonRoleJourney[],
    routeMap: ReadonlyMap<string, Readonly<{ feature: string; path: string; designCanonIds: readonly string[] }>>,
    osScopeRoutes: readonly string[]): readonly string[] {
    const blockers: string[] = [];
    const complete = new Set(["COMPLETE", "IMPLEMENTED", "VERIFIED", "CERTIFIED"]);
    roles.forEach(role => {
        if (!complete.has(role.status)) blockers.push(`ROLE_JOURNEY_INCOMPLETE:${role.role}:${role.status || "UNKNOWN"}`);
        if (!role.osRoute) return;
        const mapped = routeMap.get(role.osRoute);
        if (!mapped) blockers.push(`ROLE_OS_ROUTE_UNMAPPED:${role.role}:${role.osRoute}`);
        else if (!mapped.designCanonIds.length) blockers.push(`ROLE_OS_ROUTE_DESIGN_CANON_MISSING:${role.role}:${role.osRoute}`);
        if (osScopeRoutes.length && !osScopeRoutes.includes(role.osRoute)) {
            blockers.push(`ROLE_OS_ROUTE_NOT_DECLARED_IN_OS_SCOPE:${role.role}:${role.osRoute}`);
        }
    });
    return blockers;
}

const roleNamesByPathway: Readonly<Record<string, readonly string[]>> = {
    SCHOLAR: ["SCHOLAR"],
    SCHOLAR_ATHLETE: ["SCHOLAR-ATHLETE"],
    PARENT_GUARDIAN: ["FAMILY", "PARENT / GUARDIAN", "PARENT GUARDIAN"],
    TEACHER_EDUCATOR: ["EDUCATOR", "TEACHER / EDUCATOR", "TEACHER EDUCATOR"],
    HIGH_SCHOOL_COUNSELOR: ["HIGH SCHOOL COUNSELOR", "COUNSELOR"],
    MENTOR: ["MENTOR"],
    HIGH_SCHOOL_COACH: ["HIGH SCHOOL COACH", "COACH"],
    COLLEGE_COACH_RECRUITER: ["COLLEGE COACH / RECRUITER", "COLLEGE COACH RECRUITER"],
    COLLEGE_ADMISSIONS: ["COLLEGE ADMISSIONS OFFICER", "COLLEGE ADMISSIONS"],
    BRAND_PARTNER: ["BRAND PARTNER"],
    EMPLOYER: ["EMPLOYER", "EMPLOYER / WORKFORCE PARTNER"],
    TRANSITION_AGED_YOUTH: ["TRANSITION-AGED YOUTH", "TRANSITION AGED YOUTH"],
    ATHLETES_ABROAD: ["ATHLETE ABROAD", "ATHLETES ABROAD"],
    DISTRICT_SCHOOL_ADMIN: ["DISTRICT / SCHOOL ADMINISTRATOR", "DISTRICT", "SCHOOL ADMINISTRATOR"],
    COMMUNITY_PARTNER: ["OTHER", "COMMUNITY PARTNER", "OTHER / COMMUNITY PARTNER"]
};

function compileFullRoadmap(roles: readonly PlaybookCanonRoleJourney[], trackedFiles: readonly string[],
    routeMap: ReadonlyMap<string, Readonly<{ feature: string; path: string; designCanonIds: readonly string[] }>>): Readonly<{
        operatingSystems: readonly PlaybookCanonOperatingSystem[];
        onboardingPathways: readonly PlaybookCanonOnboardingPathway[];
        blockers: readonly string[];
    }> {
    assertPlaybookFullCanonicalRoadmap();
    const implementedRoutes = new Set(trackedFiles.filter(path => /^app\/(?!api\/).+\/page\.(tsx?|jsx?)$/.test(path) || /^app\/page\.(tsx?|jsx?)$/.test(path))
        .map(routeFromPage));
    const blockers: string[] = [];
    const operatingSystems = PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.map(item => {
        const routeImplemented = implementedRoutes.has(item.route);
        const mapped = routeMap.get(item.route);
        if (!routeImplemented) blockers.push(`CANONICAL_OS_ROUTE_MISSING:${item.osId}:${item.route}`);
        if (!mapped) blockers.push(`CANONICAL_OS_ROUTE_UNMAPPED:${item.osId}:${item.route}`);
        else if (!mapped.designCanonIds.length) blockers.push(`CANONICAL_OS_DESIGN_MISSING:${item.osId}:${item.route}`);
        return { osId: item.osId, label: item.label, route: item.route, routeImplemented,
            routeMapped: Boolean(mapped), designBound: Boolean(mapped?.designCanonIds.length) };
    });
    const onboardingPathways = PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.map(item => {
        const acceptedNames = new Set((roleNamesByPathway[item.pathwayId] ?? [item.label]).map(name => name.toUpperCase()));
        const role = roles.find(candidate => acceptedNames.has(candidate.role.toUpperCase()));
        const status = role?.status ?? "MISSING";
        if (!role) blockers.push(`CANONICAL_ONBOARDING_JOURNEY_MISSING:${item.pathwayId}`);
        else if (!["COMPLETE", "IMPLEMENTED", "VERIFIED", "CERTIFIED"].includes(status)) {
            blockers.push(`CANONICAL_ONBOARDING_JOURNEY_INCOMPLETE:${item.pathwayId}:${status}`);
        }
        return { pathwayId: item.pathwayId, label: item.label, operatingSystemId: item.operatingSystemId,
            roleJourney: role?.role, status };
    });
    return { operatingSystems, onboardingPathways, blockers };
}

function parseProductJourneyIds(source: string): Readonly<{ journeyIds: readonly string[]; blockers: readonly string[] }> {
    const blockers: string[] = [];
    try {
        const parsed = JSON.parse(source) as { productJourneys?: unknown; governedRevision?: unknown };
        if (typeof parsed.governedRevision !== "string" || !parsed.governedRevision.trim()) {
            blockers.push("CANON_PRODUCT_JOURNEYS_REVISION_MISSING");
        } else if (!/^[a-f0-9]{7,40}$/i.test(parsed.governedRevision.trim())) {
            blockers.push(`CANON_PRODUCT_JOURNEYS_REVISION_INVALID:${parsed.governedRevision}`);
        }
        if (parsed.productJourneys === undefined) {
            blockers.push("CANON_PRODUCT_JOURNEYS_MISSING");
            return { journeyIds: [], blockers };
        }
        if (!Array.isArray(parsed.productJourneys)) {
            blockers.push("CANON_PRODUCT_JOURNEYS_STRUCTURE_INVALID");
            return { journeyIds: [], blockers };
        }

        const journeyIds: string[] = [];
        parsed.productJourneys.forEach((item, index) => {
            const journeyId = typeof item === "object" && item !== null && "journeyId" in item
                ? (item as { journeyId?: unknown }).journeyId
                : undefined;
            if (typeof journeyId !== "string") {
                blockers.push(`CANON_PRODUCT_JOURNEY_ID_TYPE_INVALID:${index}`);
                return;
            }
            const normalizedJourneyId = journeyId.trim();
            if (!/^[A-Z0-9-]+$/.test(normalizedJourneyId)) {
                blockers.push(`CANON_PRODUCT_JOURNEY_ID_FORMAT_INVALID:${normalizedJourneyId || "EMPTY"}`);
                return;
            }
            journeyIds.push(normalizedJourneyId);
        });

        const duplicates = journeyIds.filter((journeyId, index, ids) => ids.indexOf(journeyId) !== index);
        if (duplicates.length) {
            blockers.push(`CANON_PRODUCT_JOURNEYS_DUPLICATE:${[...new Set(duplicates)].join(",")}`);
        }

        return { journeyIds: [...new Set(journeyIds)], blockers };
    } catch {
        return { journeyIds: [], blockers: ["CANON_PRODUCT_JOURNEYS_JSON_INVALID"] };
    }
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
        const { journeyIds: productJourneyIds, blockers: productJourneyBlockers } =
            parseProductJourneyIds(sourceByPath.get("pbos/readiness/048-canon-journeys.json") ?? "");
        blockers.push(...productJourneyBlockers);
        if (!productJourneyIds.length) blockers.push("CANON_PRODUCT_JOURNEYS_EMPTY");
        PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS.filter(journeyId => !productJourneyIds.includes(journeyId))
            .forEach(journeyId => blockers.push(`CANON_PRODUCT_JOURNEY_REQUIRED_MISSING:${journeyId}`));

        const requirements = parseRequirements(sourceByPath.get("docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md") ?? "");
        if (!requirements.length) blockers.push("PRODUCT_REQUIREMENTS_UNAVAILABLE");
        requirements.filter(requirement => requirement.status !== "IMPLEMENTED")
            .forEach(requirement => blockers.push(`REQUIREMENT_${requirement.status}:${requirement.requirementId}`));

        const routeMap = parseRouteMap(sourceByPath.get("docs/design/CANONICAL_ROUTE_MAP.md") ?? "");
        const osScopeRoutes = [...new Set(PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.map(item => item.route))];
        const roleJourneys = parseRoleJourneys(sourceByPath.get("docs/USER_JOURNEYS.md") ?? "");
        blockers.push(...roleJourneys.blockers);
        blockers.push(...roleJourneyBlockers(roleJourneys.roles, routeMap, osScopeRoutes));
        const roadmap = compileFullRoadmap(roleJourneys.roles, trackedFiles, routeMap);
        blockers.push(...roadmap.blockers);
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
            phases, requirements, routes, operatingSystems: roadmap.operatingSystems,
            onboardingPathways: roadmap.onboardingPathways, productJourneyIds,
            blockers: uniqueBlockers, certificationReady: uniqueBlockers.length === 0 };
    }
}
