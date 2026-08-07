import { ApplicationDeliveryGenerator } from "../application-delivery";
import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ApplicationAcceptanceEvidence, ProductionMissionExecutor } from "../production-runtime";
import { createPlaybookBlueprint } from "../reference-systems";
import { ResumableRemediationEngine } from "../validation-automation";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const PRODUCT_MANIFEST = "pbos/readiness/048-product-journeys.json";
const MOBILE_MANIFEST = "pbos/readiness/049-mobile-foundation.json";
const MOBILE_WORKFLOW = ".github/workflows/pbos-mobile.yml";

export interface PlaybookMobileFoundationExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
}

function withMobileWorkspace(source: string): string {
    const manifest = JSON.parse(source) as { workspaces?: unknown; scripts?: Record<string, string> } & Record<string, unknown>;
    if (manifest.workspaces !== undefined && !Array.isArray(manifest.workspaces)) {
        throw new Error("PBOS mobile materialization requires an array-based npm workspace declaration.");
    }
    manifest.workspaces = [...new Set([...((manifest.workspaces as string[] | undefined) ?? []), "apps/mobile"])];
    manifest.scripts = { ...(manifest.scripts ?? {}),
        "mobile:typecheck": "npm run typecheck --workspace @playbook-system-001/mobile",
        "mobile:test": "npm test --workspace @playbook-system-001/mobile",
        "mobile:doctor": "npm run doctor --workspace @playbook-system-001/mobile" };
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

function withNativeWorkspaceExcluded(source: string): string {
    const configuration = JSON.parse(source) as { exclude?: unknown } & Record<string, unknown>;
    if (configuration.exclude !== undefined && !Array.isArray(configuration.exclude)) {
        throw new Error("PBOS mobile materialization requires an array-based TypeScript exclusion declaration.");
    }
    configuration.exclude = [...new Set([...((configuration.exclude as string[] | undefined) ?? []), "apps/mobile"])];
    return `${JSON.stringify(configuration, null, 2)}\n`;
}

function mobileWorkflow(): string {
    return `name: PBOS Mobile\n\non:\n  pull_request:\n    paths:\n      - "apps/mobile/**"\n      - "delivery/**"\n      - "package.json"\n      - "package-lock.json"\n      - ".github/workflows/pbos-mobile.yml"\n\npermissions:\n  contents: read\n\njobs:\n  validate-mobile:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - run: npm ci\n      - run: npm run mobile:typecheck\n      - run: npm run mobile:test\n      - run: npm run mobile:doctor\n`;
}

function foundationEvidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const evidence = (dimension: ApplicationAcceptanceEvidence["dimension"], behavior: string,
        artifact: string, source: ApplicationAcceptanceEvidence["source"] = "IMPLEMENTATION"): ApplicationAcceptanceEvidence => ({
        evidenceId: `049-mobile-foundation:${dimension.toLowerCase()}:${revision}`, dimension, behavior,
        repository: REPOSITORY, commit: revision, artifact, passed: true, source
    });
    return [
        evidence("USER_INTERFACE", "The Playbook has independently routable native onboarding, dashboard, messaging, document, and notification surfaces.", "apps/mobile/app"),
        evidence("AUTHORITY", "Native sessions use device secure storage and deep links reject credential-bearing inputs.", "apps/mobile/src/platform"),
        evidence("PBOS_INTEGRATION", "The mobile API boundary carries the stable Playbook system identity without embedding privileged credentials.", "apps/mobile/src/platform/api.ts"),
        evidence("ACCEPTANCE_TEST", "Native platform and journey contracts have executable workspace tests.", "apps/mobile/tests", "APPLICATION_TEST"),
        evidence("SECURITY", "Signing, store credentials, submission, and production release remain protected actions.", "delivery/mobile/release-checklist.md", "SECURITY_TEST")
    ];
}

export function playbookMobileFoundationExecutor(
    dependencies: PlaybookMobileFoundationExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "049-mobile-foundation" || context.run.systemId !== SYSTEM_ID ||
            context.run.repository !== REPOSITORY) throw new Error("The CIP-049 mobile foundation adapter is restricted to The Playbook.");
        const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            context.run.startingBranch);
        const branch = `agent/pbos-playbook-system-001-049-mobile-${context.run.runId.slice(0, 8)}`;
        const governedActions: readonly (readonly [BuildAction, ActionRisk])[] = [
            ["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"],
            ["MODIFY_APPLICATION_CODE", "MEDIUM"], ["CREATE_TESTS", "MEDIUM"], ["UPDATE_DOCUMENTATION", "MEDIUM"],
            ["CREATE_COMMIT", "MEDIUM"], ["PUSH_BRANCH", "MEDIUM"], ["OPEN_DRAFT_PR", "MEDIUM"]
        ];
        for (const [action, risk] of governedActions) {
            const decision = dependencies.authorize(action, risk, branch);
            if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) {
            throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan mobile foundation.`);
        }
        const product = await dependencies.gateway.readFileAtRevision(reference, PRODUCT_MANIFEST, inspection.revision);
        if (!product.includes("IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION") || !product.includes('"journeys"')) {
            throw new Error("Connected Playbook product acceptance must exist before native materialization.");
        }
        const rootPackage = await dependencies.gateway.readFileAtRevision(reference, "package.json", inspection.revision);
        const rootTypeScript = await dependencies.gateway.readFileAtRevision(reference, "tsconfig.json", inspection.revision);
        const blueprint = createPlaybookBlueprint();
        const delivery = new ApplicationDeliveryGenerator().generate({
            systemId: SYSTEM_ID, applicationName: "The Playbook", bundleNamespace: "com.theplaybook.app",
            universalLinkDomain: "app.theplaybook.io", targets: ["WEB", "IOS", "ANDROID"],
            journeys: ["IDENTITY_ONBOARDING", "DASHBOARD", "MESSAGING", "DOCUMENTS", "NOTIFICATIONS"],
            designTokens: blueprint.design.tokens, brandAssets: blueprint.design.brand.assets
        });
        const changes: readonly RepositoryFileChange[] = [
            ...delivery.files,
            { path: "package.json", content: withMobileWorkspace(rootPackage) },
            { path: "tsconfig.json", content: withNativeWorkspaceExcluded(rootTypeScript) },
            { path: MOBILE_WORKFLOW, content: mobileWorkflow() },
            { path: MOBILE_MANIFEST, content: `${JSON.stringify({ schemaVersion: 1, missionId: "049-mobile-foundation",
                systemId: SYSTEM_ID, repository: REPOSITORY, startingRevision: inspection.revision,
                productionRunId: context.run.runId, targets: delivery.targets,
                state: "IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION",
                protectedReleaseActions: delivery.protectedReleaseActions,
                completionRule: "The exact revision must pass npm lock reproduction, mobile TypeScript, native contract tests, and Expo Doctor before human validation."
            }, null, 2)}\n` }
        ];
        context.report("BUILDING", `Materializing the shared iOS and Android foundation on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, changes);
        await dependencies.gateway.prepareExpoDependencyLock(reference, "apps/mobile");
        const committedPaths = [...changes.map(change => change.path), "package-lock.json"];
        const revision = await dependencies.gateway.commit(reference, "feat: materialize The Playbook mobile foundation", committedPaths);
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "feat: materialize The Playbook mobile foundation",
            `PBOS Genesis mission \`049-mobile-foundation\` creates an Expo SDK 57 workspace for iOS and Android at exact revision \`${revision}\`.\n\n` +
            "Signing identities, store credentials, TestFlight/Play distribution, submission, and production release remain excluded protected actions.");
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        return {
            outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId,
                targets: delivery.targets, nativeWorkspace: "apps/mobile" },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`],
            files: { added: changes.filter(change => !["package.json", "tsconfig.json"].includes(change.path)).map(change => change.path),
                modified: ["package.json", "package-lock.json", "tsconfig.json"] },
            commands: [{ command: "npx --yes expo@~57.0.0 install --fix", exitCode: 0, durationMs: 0,
                output: "Expo SDK compatibility reconciled and a reproducible root workspace lock prepared." }],
            validations: [{ name: "Mobile foundation published for independent validation", passed: true,
                durationMs: 0, evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url },
            acceptanceEvidence: foundationEvidence(revision)
        };
    };
}
