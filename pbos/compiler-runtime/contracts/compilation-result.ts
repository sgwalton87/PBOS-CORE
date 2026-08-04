import { SystemArtifact } from "../../acquisition-engine";
import { GovernanceArtifact } from "../../compiler-artifacts";
import { CompilationJob } from "./compilation-job";
import { CompilationArtifact, CompilationLineageRecord } from "./compilation-stage";

export interface CompiledPbosSystemArtifact {
    readonly id: string;
    readonly artifactType: "COMPILED_PBOS_SYSTEM";
    readonly schemaVersion: string;
    readonly targetSystemId: string;
    readonly sourceArtifact: SystemArtifact;
    readonly artifacts: readonly CompilationArtifact[];
    readonly governanceArtifact: GovernanceArtifact;
    readonly lineage: readonly CompilationLineageRecord[];
    readonly compiledAt: Date;
}

export interface CompilationResult {
    readonly success: boolean;
    readonly job: CompilationJob;
    readonly compiledArtifact?: CompiledPbosSystemArtifact;
}
