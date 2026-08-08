import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ProductionMissionExecutor } from "../production-runtime";
import { ResumableRemediationEngine } from "../validation-automation";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const ROUTE_MAP = "docs/design/CANONICAL_ROUTE_MAP.md";
const DESIGN_README = "docs/design/canon/product-shell/README.md";
const DESIGN_MANIFEST = "docs/design/canon/product-shell/manifest.json";
const READINESS = "pbos/readiness/048-canon-design.json";
const DESIGN_ID = "PGDS-001";

export interface PlaybookCanonDesignExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
}

const routeFromPage = (path: string): string => (path.replace(/^app/, "").replace(/\/page\.(tsx?|jsx?)$/, "") || "/")
    .replace(/\/\([^/]+\)/g, "");
const label = (route: string): string => route === "/" ? "Landing Page" : route.split("/").filter(Boolean)
    .map(part => part.replace(/\[(.+)\]/, "$1 detail").split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")).join(" — ");

export function compileCanonicalDesignRouteMap(existing: string, trackedFiles: readonly string[], revision: string): string {
    const sectionStart = existing.indexOf("## Canonical Screens");
    const sectionEnd = existing.indexOf("## Existing Design System Inventory");
    if (sectionStart < 0 || sectionEnd <= sectionStart) throw new Error("Canonical route map screen boundary is malformed.");
    const currentRows = new Map<string, string[]>();
    existing.slice(sectionStart, sectionEnd).split(/\r?\n/).forEach(line => {
        const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
        const route = cells[1]?.match(/`(\/[^`]*)`/)?.[1];
        if (route && cells.length >= 8) currentRows.set(route, cells);
    });
    const pages = trackedFiles.filter(path => /^app\/(?!api\/).+\/page\.(tsx?|jsx?)$/.test(path) || /^app\/page\.(tsx?|jsx?)$/.test(path));
    const byRoute = new Map<string, string>();
    pages.sort().forEach(path => byRoute.set(routeFromPage(path), path));
    const rows = [...byRoute].sort(([left], [right]) => left.localeCompare(right)).map(([route, path]) => {
        const current = currentRows.get(route);
        if (current) {
            const status = current[4].includes(DESIGN_ID) ? current[4] : `${current[4]}; ${DESIGN_ID} product-shell target`;
            return `| ${current[0]} | \`${route}\` | \`${path}\` | ${current[3]} | ${status} | ${current[5]} | ${current[6]} | ${current[7]} |`;
        }
        return `| ${label(route)} | \`${route}\` | \`${path}\` | ${DESIGN_ID} responsive product-shell target | ${DESIGN_ID} target; implementation and visual acceptance pending | Not yet inventoried | \`${path}\` | Requires canon phase implementation and exact-revision acceptance |`;
    });
    const screens = `## Canonical Screens\n\nGoverned route inventory at \`${revision}\`. \`${DESIGN_ID}\` is the shared futuristic product-shell target; a target binding is not visual implementation or certification.\n\n| Feature | Route | Rendered file | Shared layout | Current status | Duplicate implementations found | Canonical implementation selected | Legacy implementation status |\n|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n\n`;
    return `${existing.slice(0, sectionStart)}${screens}${existing.slice(sectionEnd)}`;
}

function files(routeMap: string, revision: string, runId: string, routeCount: number): readonly RepositoryFileChange[] {
    const authority = ["docs/design/PLAYBOOK_DESIGN_SYSTEM.md", "docs/UI_DESIGN_SYSTEM.md", "styles/playbook-tokens.css",
        "app/globals.css", "components/shell/UnifiedAppShell.tsx"];
    return [{ path: ROUTE_MAP, content: routeMap }, { path: DESIGN_README, content:
`# ${DESIGN_ID} Playbook Product Shell Canon

${DESIGN_ID} binds every visible Playbook route to the canonical futuristic navy, cream, and orange product-shell language already governed by the Playbook design-system sources.

This package is a target contract. It does not assert that a route has been visually transformed or accepted. Each phase must implement responsive desktop/mobile states, role-appropriate navigation, real data, accessibility, and visual evidence before certification.

Authority sources:
${authority.map(path => `- \`${path}\``).join("\n")}
` }, { path: DESIGN_MANIFEST, content: `${JSON.stringify({ schemaVersion: 1, designCanonId: DESIGN_ID,
        repository: REPOSITORY, governedRevision: revision, authoritySources: authority, routeCount,
        state: "TARGET_BOUND_IMPLEMENTATION_PENDING", certificationBoundary: "No visual implementation or approval is inferred." }, null, 2)}\n` },
    { path: READINESS, content: `${JSON.stringify({ schemaVersion: 1, missionId: "048-canon-design", systemId: SYSTEM_ID,
        governedRevision: revision, productionRunId: runId, designCanonId: DESIGN_ID, routeCount,
        state: "ROUTES_BOUND_PENDING_PHASE_IMPLEMENTATION" }, null, 2)}\n` }];
}

export function playbookCanonDesignExecutor(dependencies: PlaybookCanonDesignExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "048-canon-design" || context.run.systemId !== SYSTEM_ID || context.run.repository !== REPOSITORY) {
            throw new Error("The Playbook design canon adapter is repository restricted.");
        }
        if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) {
            throw new Error("The active Genesis session does not authorize Playbook design canon compilation.");
        }
        const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, context.run.startingBranch);
        const branch = `agent/pbos-playbook-system-001-048-canon-design-${context.run.runId.slice(0, 8)}`;
        for (const [action, risk] of [["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"], ["UPDATE_DOCUMENTATION", "MEDIUM"],
            ["CREATE_COMMIT", "MEDIUM"], ["PUSH_BRANCH", "MEDIUM"], ["OPEN_DRAFT_PR", "MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]) {
            const decision = dependencies.authorize(action, risk, branch); if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan.`);
        const current = await dependencies.gateway.readFileAtRevision(reference, ROUTE_MAP, inspection.revision);
        const tracked = inspection.files ?? [];
        const visible = tracked.filter(path => /^app\/(?!api\/).+\/page\.(tsx?|jsx?)$/.test(path) || /^app\/page\.(tsx?|jsx?)$/.test(path));
        const routeMap = compileCanonicalDesignRouteMap(current, tracked, inspection.revision);
        const changes = files(routeMap, inspection.revision, context.run.runId, new Set(visible.map(routeFromPage)).size);
        context.report("BUILDING", `Binding ${visible.length} visible route implementations to ${DESIGN_ID} on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision); await dependencies.gateway.applyChange(reference, changes);
        const revision = await dependencies.gateway.commit(reference, "docs: bind Playbook routes to product design canon", changes.map(change => change.path));
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "docs: bind Playbook routes to product design canon", `PBOS mission \`048-canon-design\` binds every visible route at \`${inspection.revision}\` to the shared \`${DESIGN_ID}\` target. This is an implementation contract, not visual certification.\n\nGenerated revision: \`${revision}\`.`);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        return { outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId, routeCount: visible.length },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`],
            files: { modified: [ROUTE_MAP], added: [DESIGN_README, DESIGN_MANIFEST, READINESS] },
            commands: [{ command: "bind visible routes to Playbook design canon", exitCode: 0, durationMs: 0, output: `${visible.length} routes bound` }],
            validations: [{ name: "Design target bindings published for independent validation", passed: true, durationMs: 0,
                evidenceId: `pull-request:${pullRequest.number}` }], deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url } };
    };
}
