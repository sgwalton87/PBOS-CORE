/*
===============================================================================

PBOS Compiler Artifact Registry

Authority

PBOS-ARTIFACT-003

Classification

Constitutional Registry

===============================================================================
*/

import { CompilerArtifact }
from "../contracts/compiler-artifact";

export class ArtifactRegistry {

    private readonly artifacts =
        new Map<string, CompilerArtifact>();

    register(
        artifact: CompilerArtifact
    ): void {

        this.artifacts.set(
            artifact.id,
            artifact
        );

    }

    resolve(
        id: string
    ): CompilerArtifact | undefined {

        return this.artifacts.get(id);

    }

    findByType<T extends CompilerArtifact>(
        artifactType: string
    ): T | undefined {

        for (const artifact of this.artifacts.values()) {

            if (artifact.artifactType === artifactType) {

                return artifact as T;

            }

        }

        return undefined;

    }

    getAll(): readonly CompilerArtifact[] {

        return [
            ...this.artifacts.values()
        ];

    }

    count(): number {

        return this.artifacts.size;

    }

    clear(): void {

        this.artifacts.clear();

    }

}
