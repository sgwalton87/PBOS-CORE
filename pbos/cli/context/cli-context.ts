/*
===============================================================================

PBOS CLI Context

Authority

PBOS-CLI-012

Classification

Constitutional Context

===============================================================================

Purpose

Provides shared execution context for the PBOS Command Line Interface.

The CLI Context SHALL preserve runtime identity, execution metadata, and
command-scoped state across a CLI invocation.

===============================================================================
*/

export class CliContext {

    readonly startedAt = new Date();

    readonly metadata =

        new Map<string, unknown>();

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
