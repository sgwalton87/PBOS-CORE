/*
===============================================================================

PBOS Compiler Context

Authority

PBOS-CIP-002B-005

Classification

Constitutional Compiler Context

===============================================================================
*/

import { CompilerArtifact } from "../../compiler-artifacts";

export class CompilerContext {

    readonly metadata = new Map<string, unknown>();

    private readonly artifactRegistry =
        new Map<string, CompilerArtifact>();

    registerArtifact(
        artifact: CompilerArtifact
    ): void {

        this.artifactRegistry.set(
            artifact.id,
            artifact
        );

    }

    findArtifact<T extends CompilerArtifact>(
        artifactType: string
    ): T | undefined {

        for (const artifact of this.artifactRegistry.values()) {

            if (artifact.artifactType === artifactType) {

                return artifact as T;

            }

        }

        return undefined;

    }

    getArtifacts(): readonly CompilerArtifact[] {

        return [...this.artifactRegistry.values()];

    }

    set(
        key: string,
        value: unknown
    ): void {

        this.metadata.set(
            key,
            value
        );

    }

    get<T>(
        key: string
    ): T | undefined {

        return this.metadata.get(
            key
        ) as T | undefined;

    }

}