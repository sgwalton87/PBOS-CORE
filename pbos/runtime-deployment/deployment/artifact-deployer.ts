import { randomUUID } from "crypto";
import { CompiledPbosSystemArtifact } from "../../compiler-runtime";
import { DeploymentManifest } from "../contracts/deployment-manifest";
import { RuntimeEnvironment } from "../contracts/runtime-environment";

export class ArtifactDeployer {
    prepare(
        artifact: CompiledPbosSystemArtifact,
        environment: RuntimeEnvironment,
        requiredServiceIds: readonly string[] = []
    ): DeploymentManifest {
        if (artifact.artifactType !== "COMPILED_PBOS_SYSTEM" || !artifact.governanceArtifact) {
            throw new Error("A governed compiled PBOS system artifact is required.");
        }
        return {
            manifestId: randomUUID(),
            compiledArtifactId: artifact.id,
            targetSystemId: artifact.targetSystemId,
            schemaVersion: artifact.schemaVersion,
            environmentId: environment.environmentId,
            domainIds: [...new Set(artifact.sourceArtifact.architecture.domains)]
                .map(domain => `${artifact.targetSystemId}:${domain}`),
            requiredServiceIds: [...requiredServiceIds],
            lineage: artifact.lineage.flatMap(record => record.outputArtifactIds),
            createdAt: new Date()
        };
    }
}
