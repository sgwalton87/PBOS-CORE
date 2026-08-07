import { GitHubRepositoryGateway } from "../platform";
import { createBulletproofBlueprint, createPlaybookBlueprint } from "../reference-systems";
import { ProjectRemediationProfileRegistry, RemediationPackRegistry } from "./remediation-pack-registry";
import { EducationRemediationPack, LegacyPlanningRemediationPack, NextJsRemediationPack, NodeDependencyRemediationPack,
    OpportunityJourneyReactLintRemediationPack, PlaywrightAcceptanceIsolationRemediationPack,
    SupabaseRemediationPack } from "./standard-remediation-packs";
import { UniversalRemediationHandler } from "./universal-remediation-handler";

export function createDefaultRemediationHandler(gateway: GitHubRepositoryGateway): UniversalRemediationHandler {
    const packs = new RemediationPackRegistry();
    [new NodeDependencyRemediationPack(), new NextJsRemediationPack(), new SupabaseRemediationPack(),
        new LegacyPlanningRemediationPack(), new EducationRemediationPack(), new PlaywrightAcceptanceIsolationRemediationPack(),
        new OpportunityJourneyReactLintRemediationPack()]
        .forEach(pack => packs.register(pack));
    const projects = new ProjectRemediationProfileRegistry();
    projects.register({
        systemId: "BULLETPROOF-SYSTEM-001",
        repository: "vycoywalton/bulletproof-beneficiary-registry",
        remediationPackIds: [
            "@pbos/remediation-node-dependencies",
            "@pbos/remediation-nextjs",
            "@pbos/remediation-supabase",
            "@pbos/remediation-legacy-planning"
        ],
        createBlueprint: createBulletproofBlueprint
    });
    projects.register({
        systemId: "PLAYBOOK-SYSTEM-001",
        repository: "sgwalton87/playbook-platform",
        remediationPackIds: [
            "@pbos/remediation-node-dependencies",
            "@pbos/remediation-nextjs",
            "@pbos/remediation-supabase",
            "@pbos/remediation-education",
            "@pbos/remediation-playwright-acceptance-isolation",
            "@pbos/remediation-opportunity-react-lint"
        ],
        createBlueprint: createPlaybookBlueprint
    });
    return new UniversalRemediationHandler(gateway, packs, projects);
}
