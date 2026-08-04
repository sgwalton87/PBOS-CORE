import { GitHubRepositoryGateway } from "../platform";
import { createBulletproofBlueprint } from "../reference-systems";
import { ProjectRemediationProfileRegistry, RemediationPackRegistry } from "./remediation-pack-registry";
import { LegacyPlanningRemediationPack, NextJsRemediationPack, NodeDependencyRemediationPack, SupabaseRemediationPack } from "./standard-remediation-packs";
import { UniversalRemediationHandler } from "./universal-remediation-handler";

export function createDefaultRemediationHandler(gateway: GitHubRepositoryGateway): UniversalRemediationHandler {
    const packs = new RemediationPackRegistry();
    [new NodeDependencyRemediationPack(), new NextJsRemediationPack(), new SupabaseRemediationPack(), new LegacyPlanningRemediationPack()]
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
    return new UniversalRemediationHandler(gateway, packs, projects);
}
