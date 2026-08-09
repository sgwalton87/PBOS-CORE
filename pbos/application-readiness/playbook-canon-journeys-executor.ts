import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ProductionMissionExecutor } from "../production-runtime";
import { ResumableRemediationEngine } from "../validation-automation";
import { PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS, PLAYBOOK_CANONICAL_OPERATING_SYSTEMS,
    PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS, playbookCanonicalJourneySpecification } from "./playbook-full-canonical-roadmap";

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

interface ProductAcceptanceJourneySource {
    readonly journeyId: string;
    readonly canonicalCoverage: string;
}

const registryRoleNames: Readonly<Record<string, readonly string[]>> = {
    SCHOLAR: ["SCHOLAR"], SCHOLAR_ATHLETE: ["SCHOLAR-ATHLETE"], PARENT_GUARDIAN: ["FAMILY", "PARENT / GUARDIAN"],
    TEACHER_EDUCATOR: ["EDUCATOR", "TEACHER / EDUCATOR"], HIGH_SCHOOL_COUNSELOR: ["HIGH SCHOOL COUNSELOR", "COUNSELOR"],
    MENTOR: ["MENTOR"], HIGH_SCHOOL_COACH: ["HIGH SCHOOL COACH", "COACH"],
    COLLEGE_COACH_RECRUITER: ["COLLEGE COACH / RECRUITER"], COLLEGE_ADMISSIONS: ["COLLEGE ADMISSIONS OFFICER"],
    BRAND_PARTNER: ["BRAND PARTNER"], EMPLOYER: ["EMPLOYER"], TRANSITION_AGED_YOUTH: ["TRANSITION-AGED YOUTH"],
    ATHLETES_ABROAD: ["ATHLETE ABROAD", "ATHLETES ABROAD"],
    DISTRICT_SCHOOL_ADMIN: ["DISTRICT / SCHOOL ADMINISTRATOR"], COMMUNITY_PARTNER: ["OTHER", "COMMUNITY PARTNER"]
};

function completeRoleTopology(declared: readonly RoleJourneySource[]): readonly RoleJourneySource[] {
    const result = [...declared];
    for (const pathway of PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS) {
        const names = new Set((registryRoleNames[pathway.pathwayId] ?? [pathway.label]).map(name => name.toUpperCase()));
        if (result.some(role => names.has(role.role.toUpperCase()))) continue;
        const operatingSystem = PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.find(item => item.osId === pathway.operatingSystemId);
        if (!operatingSystem) throw new Error(`Canonical onboarding pathway ${pathway.pathwayId} has no operating system.`);
        result.push({ role: pathway.label.replace(/ onboarding$/i, ""),
            signup: "MISSING: no canonical signup contract is declared.",
            onboarding: "MISSING: no role-specific onboarding implementation is declared.",
            osRoute: operatingSystem.route, dashboard: `MISSING: ${operatingSystem.label} behavior is not accepted.`,
            permissions: "MISSING: least-privilege authority contract is not accepted.",
            recordType: "MISSING: canonical record ownership is not declared.",
            playbookRecord: "MISSING: durable Playbook Record projection is not accepted.",
            scholarRecord: "MISSING: Scholar Record relationship is not accepted.",
            verification: "MISSING: role verification and consent are not accepted.", status: "MISSING" });
    }
    return result;
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

export function parseProductAcceptanceJourneys(source: string): readonly ProductAcceptanceJourneySource[] {
    const section = source.split(/^## Supported product acceptance journeys$/m)[1]?.split(/^## /m)[0] ?? "";
    const journeys: ProductAcceptanceJourneySource[] = [];
    for (const line of section.split(/\r?\n/)) {
        if (!line.startsWith("|")) continue;
        const cells = line.split("|").slice(1, -1).map(clean);
        if (cells.length !== 2 || cells[0] === "Journey ID" || /^-+$/.test(cells[0])) continue;
        journeys.push({ journeyId: cells[0], canonicalCoverage: cells[1] });
    }
    if (!journeys.length) throw new Error("Canonical user journeys contain no supported product acceptance journeys.");
    return journeys;
}

function sprintIds(source: string): readonly string[] {
    return [...source.matchAll(/^## Sprint (OR-\d{3}) — (.+)$/gm)].map(match => `${match[1]} — ${match[2].trim()}`);
}

function routeCount(source: string): number {
    return source.split(/\r?\n/).filter(line => /^\|[^-].*`\/[^"]*`/.test(line)).length;
}

function parseStructuredProductAcceptanceJourneys(source: string): readonly ProductAcceptanceJourneySource[] {
    const section = source.split(/^## Product acceptance journeys$/m)[1]?.split(/^## /m)[0] ?? "";
    const journeys: ProductAcceptanceJourneySource[] = [];
    for (const line of section.split(/\r?\n/)) {
        if (!line.startsWith("|")) continue;
        const cells = line.split("|").slice(1, -1).map(clean);
        if (cells.length !== 2 || cells[0] === "Journey ID" || /^-+$/.test(cells[0])) continue;
        if (!/^[A-Z0-9-]+$/.test(cells[0])) {
            throw new Error(`Canonical sprint authority declares an invalid product journey ID: ${cells[0]}`);
        }
        journeys.push({ journeyId: cells[0], canonicalCoverage: cells[1] });
    }
    if (!journeys.length) {
        throw new Error("Canonical sprint authority contains no structured product acceptance journeys.");
    }
    const duplicates = journeys.map(item => item.journeyId)
        .filter((journeyId, index, list) => list.indexOf(journeyId) !== index);
    if (duplicates.length) {
        throw new Error(`Canonical sprint authority declares duplicate product journey IDs: ${[...new Set(duplicates)].join(", ")}`);
    }
    return journeys;
}

function compileProductAcceptanceJourneys(roles: readonly RoleJourneySource[], sprintMap: string): readonly ProductAcceptanceJourneySource[] {
    const scholar = roles.find(role => role.role.toUpperCase() === "SCHOLAR");
    if (!scholar) throw new Error("Canonical role registry is missing the Scholar journey required for product acceptance.");
    const declared = parseStructuredProductAcceptanceJourneys(sprintMap);
    const onboardingById = new Map(PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.map(item =>
        [`ONBOARDING-${item.pathwayId.replaceAll("_", "-")}`, item]));
    const osById = new Map(PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.map(item =>
        [`OS-${item.osId.replaceAll("_", "-")}`, item]));
    const fullRoadmap = PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS.map(journeyId => {
        const onboarding = onboardingById.get(journeyId);
        if (onboarding) return { journeyId,
            canonicalCoverage: `${onboarding.label}: discovery, authentication, durable role onboarding, verification, record projection, authority-scoped OS landing, recovery, desktop, and mobile.` };
        const operatingSystem = osById.get(journeyId)!;
        return { journeyId,
            canonicalCoverage: `${operatingSystem.label} at ${operatingSystem.route}: role-specific navigation, durable data, actions, authority denial, responsive design, accessibility, security, and recovery.` };
    });
    const fullIds = new Set(fullRoadmap.map(item => item.journeyId));
    return [...fullRoadmap, ...declared.filter(item => !fullIds.has(item.journeyId))];
}

export function compilePlaybookUserJourneys(roleRegistry: string, sprintMap: string, routeMap: string,
    revision: string): string {
    const roles = completeRoleTopology(parsePlaybookRoleJourneys(roleRegistry));
    const sprints = sprintIds(sprintMap);
    if (!sprints.length) throw new Error("Canonical onboarding sprint map contains no ordered delivery journeys.");
    const productJourneys = compileProductAcceptanceJourneys(roles, sprintMap);
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
        "## Supported product acceptance journeys",
        "",
        "| Journey ID | Canonical coverage |",
        "| --- | --- |",
        ...productJourneys.map(journey => `| ${journey.journeyId} | ${journey.canonicalCoverage} |`),
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
            ["UPDATE_DOCUMENTATION", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"], ["PUSH_BRANCH", "MEDIUM"],
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
        const roles = completeRoleTopology(parsePlaybookRoleJourneys(roleRegistry));
        const productJourneys = compileProductAcceptanceJourneys(roles, sprintMap);
        const changes: readonly RepositoryFileChange[] = [{ path: USER_JOURNEYS, content: userJourneys }, {
            path: MANIFEST, content: `${JSON.stringify({ schemaVersion: 1, missionId: "048-canon-journeys",
                repository: REPOSITORY, governedRevision: inspection.revision, productionRunId: context.run.runId,
            roleCount: roles.length, deliverySprints: sprintIds(sprintMap), sourcePaths: [ROLE_REGISTRY, SPRINT_MAP, ROUTE_MAP],
            productJourneys: productJourneys.map(journey => ({ ...journey,
                specification: playbookCanonicalJourneySpecification(journey.journeyId) })),
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
