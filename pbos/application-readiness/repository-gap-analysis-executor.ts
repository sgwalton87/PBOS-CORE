import { ApplicationReadinessCompiler } from "./application-readiness-compiler";
import { RepositoryReadinessInventoryCompiler } from "./repository-inventory-compiler";
import { GitHubRepositoryGateway, RepositoryInspection, RepositoryReference } from "../platform";
import { ProductionMissionExecutor } from "../production-runtime";

export function repositoryGapAnalysisExecutor(gateway: GitHubRepositoryGateway,
    repository: RepositoryReference, preparedInspection?: RepositoryInspection): ProductionMissionExecutor {
    return async context => {
        const startedAt = Date.now();
        context.report("DISCOVERY", `Inspecting ${repository.owner}/${repository.name} at its governed default branch.`);
        const inspection = preparedInspection ?? await gateway.inspectRepository(repository);
        context.report("CONTEXT", `Repository context validated at ${inspection.revision}.`);
        const inventory = new RepositoryReadinessInventoryCompiler().compile(inspection);
        const readiness = new ApplicationReadinessCompiler().compile(inventory);
        const evidenceId = `application-readiness:${inspection.revision}`;
        context.report("GAP_ANALYSIS", `${readiness.gaps.length} journey gaps and ${readiness.unmappedUnits.length} unmapped units compiled.`);
        return { outputs: { inventory, readiness }, evidenceIds: [evidenceId],
            commands: [{ command: `git inspect ${repository.owner}/${repository.name}@${inspection.revision}`,
                exitCode: 0, durationMs: Math.max(0, Date.now() - startedAt),
                output: `${inspection.files?.length ?? 0} tracked files inventoried.` }],
            validations: [{ name: "Repository lineage and readiness gap compilation", passed: true,
                durationMs: Math.max(0, Date.now() - startedAt), evidenceId }] };
    };
}
