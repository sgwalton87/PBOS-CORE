import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ProductionMissionExecutor } from "../production-runtime";
import { ResumableRemediationEngine } from "../validation-automation";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const ROLE_REGISTRY = "docs/GOVERNANCE/ROLE_REGISTRY.md";
const SPRINT_MAP = "docs/ONBOARDING_ROLE_OS_SPRINT_MAP.md";
const ROUTE_MAP = "docs/design/CANONICAL_ROUTE_MAP.md";
const USER_JOURNEYS = "docs/USER_JOURNEYS.md";
const MANIFEST = "pbos/readiness/048-canon-journeys.json";

export interface PlaybookCanonJourneysExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
}

interface RoleJourneySource {
    readonly role: string;
    readonly signup: string;
    readonly onboarding: string;
    readonly osRoute: string;
    readonly dashboard: string;
    readonly permissions: string;
    readonly recordType: string;
    readonly playbookRecord: string;
    readonly scholarRecord: string;
    readonly verification: string;
    readonly status: string;
}

const clean = (value: string): string => value.replaceAll("`", "").replace(/\s+/g, " ").trim();

export function parsePlaybookRoleJourneys(source: string): readonly RoleJourneySource[] {
    const roles: RoleJourneySource[] = [];
    for (const line of source.split(/\r?\n/)) {
        if (!line.startsWith("|")) continue;
        const cells = line.split("|").slice(1, -1).map(clean);
        if (cells.length !== 11 || cells[0] === "Role" || /^-+$/.test(cells[0])) continue;
        roles.push({ role: cells[0], signup: cells[1], onboarding: cells[2], osRoute: cells[3], dashboard: cells[4],
            permissions: cells[5], recordType: cells[6], playbookRecord: cells[7], scholarRecord: cells[8],
            verification: cells[9], status: cells[10] });
    }
    if (!roles.length) throw new Error("Canonical role registry contains no parseable role journeys.");
    return roles;
}

function sprintIds(source: string): readonly string[] {
    return [...source.matchAll(/^## Sprint (OR-\d{3}) — (.+)$/gm)].map(match => `${match[1]} — ${match[2].trim()}`);
}

function routeCount(source: string): number {
    return source.split(/\r?\n/).filter(line => /^\|[^-].*`\/[^"]*`/.test(line)).length;
}

export function compilePlaybookUserJourneys(roleRegistry: string, sprintMap: string, routeMap: string,
    revision: string): string {
    const roles = parsePlaybookRoleJourneys(roleRegistry);
    const sprints = sprintIds(sprintMap);
    if (!sprints.length) throw new Error("Canonical onboarding sprint map contains no ordered delivery journeys.");
    const lines = [
        "# User Journeys",
        "",
        "> Canonical owner: Playbook Product and Experience",
        `> Governed source revision: \`${revision}\``,
        `> Compiled from \`${ROLE_REGISTRY}\`, \`${SPRINT_MAP}\`, and \`${ROUTE_MAP}\`.`,
        "> This topology records intended behavior and known gaps. It is not implementation or acceptance evidence.",
        "",
        "## Global journey contract",
        "",
        "Every role journey follows one governed state sequence: public discovery → authentication → role selection → role-specific onboarding → verification/consent → canonical record projection → permission-scoped OS landing → role action → durable outcome → recovery and sign-out.",
        "",
        "A journey remains incomplete when any source field below is PARTIAL, MISSING, or NOT VERIFIED. PBOS must bind each step to implementation, desktop/mobile acceptance, accessibility, security, and durable-data evidence before product certification.",
        "",
        "## Role journey index",
        "",
        "| Role | Signup | Onboarding | OS landing | Permissions | Verification | Current status |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        ...roles.map(role => `| ${role.role} | ${role.signup} | ${role.onboarding} | ${role.osRoute} | ${role.permissions} | ${role.verification} | ${role.status} |`),
        "",
        ...roles.flatMap(role => [
            `## ${role.role}`,
            "",
            `1. **Discover and sign up:** ${role.signup}`,
            `2. **Complete role onboarding:** ${role.onboarding}`,
            `3. **Satisfy verification and consent:** ${role.verification}`,
            `4. **Create or connect the canonical Playbook Record:** ${role.playbookRecord}`,
            `5. **Create or connect the Scholar Record projection:** ${role.scholarRecord}`,
            `6. **Enter the permission-scoped OS:** ${role.osRoute}`,
            `7. **Render the canonical dashboard:** ${role.dashboard}`,
            `8. **Enforce role authority:** ${role.permissions}`,
            `9. **Persist the canonical record type:** ${role.recordType}`,
            "10. **Prove the outcome:** exact-revision desktop/mobile journey, durable data, authority denial, accessibility, security, recovery, and independent validation evidence are required.",
            "",
            `**Current source status:** ${role.status}`,
            ""
        ]),
        "## Dependency-ordered delivery journeys",
        "",
        ...sprints.map((sprint, index) => `${index + 1}. ${sprint}`),
        "",
        "## Route coverage boundary",
        "",
        `The current canonical route map declares ${routeCount(routeMap)} human-facing screen rows. Route existence does not prove journey completion; every required state must be connected to one or more role journeys and an approved design-canon ID.`,
        ""
    ];
    return `${lines.join("\n")}\n`;
}

export function playbookCanonJourneysExecutor(
    dependencies: PlaybookCanonJourneysExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "048-canon-journeys" || context.run.systemId !== SYSTEM_ID ||
            context.run.repository !== REPOSITORY) throw new Error("The Playbook canon journey adapter is repository restricted.");
        if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) {
            throw new Error("The active Genesis session does not authorize Playbook canon journey compilation.");
        }
        const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            context.run.startingBranch);
        const branch = `agent/pbos-playbook-system-001-048-canon-journeys-${context.run.runId.slice(0, 8)}`;
        for (const [action, risk] of [["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"],
            ["MODIFY_DOCUMENTATION", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"], ["PUSH_BRANCH", "MEDIUM"],
            ["OPEN_DRAFT_PR", "MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]) {
            const decision = dependencies.authorize(action, risk, branch);
            if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) {
            throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan before canon mutation.`);
        }
        const [roleRegistry, sprintMap, routeMap] = await Promise.all([
            dependencies.gateway.readFileAtRevision(reference, ROLE_REGISTRY, inspection.revision),
            dependencies.gateway.readFileAtRevision(reference, SPRINT_MAP, inspection.revision),
            dependencies.gateway.readFileAtRevision(reference, ROUTE_MAP, inspection.revision)
        ]);
        const userJourneys = compilePlaybookUserJourneys(roleRegistry, sprintMap, routeMap, inspection.revision);
        const roles = parsePlaybookRoleJourneys(roleRegistry);
        const changes: readonly RepositoryFileChange[] = [{ path: USER_JOURNEYS, content: userJourneys }, {
            path: MANIFEST, content: `${JSON.stringify({ schemaVersion: 1, missionId: "048-canon-journeys",
                repository: REPOSITORY, governedRevision: inspection.revision, productionRunId: context.run.runId,
                roleCount: roles.length, deliverySprints: sprintIds(sprintMap), sourcePaths: [ROLE_REGISTRY, SPRINT_MAP, ROUTE_MAP],
                state: "CANON_COMPILED_PENDING_INDEPENDENT_VALIDATION",
                certificationBoundary: "Journey topology is not functional acceptance evidence." }, null, 2)}\n`
        }];
        context.report("BUILDING", `Compiling ${roles.length} role journeys from governed Playbook sources on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, changes);
        const revision = await dependencies.gateway.commit(reference, "docs: compile canonical Playbook user journeys",
            changes.map(change => change.path));
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "docs: compile canonical Playbook user journeys",
            `PBOS mission \`048-canon-journeys\` compiles the existing role registry, onboarding sprint map, and canonical route map at \`${inspection.revision}\` into one auditable journey topology. Known PARTIAL and MISSING states remain explicit; this does not claim functional completion.\n\nGenerated revision: \`${revision}\`.`);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        return { outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId, roleCount: roles.length },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`],
            files: { modified: [USER_JOURNEYS], added: [MANIFEST] },
            commands: [{ command: "compile Playbook canonical user journeys", exitCode: 0, durationMs: 0,
                output: `${roles.length} role journeys compiled` }],
            validations: [{ name: "Canonical journey topology published for independent validation", passed: true,
                durationMs: 0, evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url } };
    };
}
