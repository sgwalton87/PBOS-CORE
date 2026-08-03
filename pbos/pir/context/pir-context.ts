/*
===============================================================================

PBOS PIR Context

Authority

PBOS-PIR-004

===============================================================================
*/

import { randomUUID } from "crypto";

export class PirContext {

    readonly id = randomUUID();

    readonly createdAt = new Date();

    readonly metadata =
        new Map<string, unknown>();

    readonly artifacts: string[] = [];

    addArtifact(

        artifact: string

    ): void {

        this.artifacts.push(
            artifact
        );

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
