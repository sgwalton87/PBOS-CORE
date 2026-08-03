/*
===============================================================================

PBOS Compiler Context

Authority

PBOS-PIPELINE-005

===============================================================================
*/

import { randomUUID } from "crypto";

export class CompilerContext {

    readonly id = randomUUID();

    readonly startedAt = new Date();

    readonly artifacts: string[] = [];

    readonly metadata = new Map<string, unknown>();

    addArtifact(

        artifact: string

    ): void {

        this.artifacts.push(artifact);

    }

    set(

        key: string,

        value: unknown

    ): void {

        this.metadata.set(key, value);

    }

    get<T>(

        key: string

    ): T | undefined {

        return this.metadata.get(key) as T | undefined;

    }

}
