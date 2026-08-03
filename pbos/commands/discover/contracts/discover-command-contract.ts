/*
===============================================================================

PBOS Discover Command Contract

Classification

Constitutional Command Contract

Authority

PBS-CMD-DSC

===============================================================================

Purpose

Defines the executable contract implemented by every Discover Command.

The Discover Command SHALL launch a Constitutional Discovery Session and
produce a Discovery Report suitable for Organizational Compilation.

===============================================================================
*/

export type DiscoveryExecutionMode =

    | "IDEA"
    | "DOCUMENTS"
    | "REPOSITORY"
    | "HYBRID";

export interface DiscoverCommandRequest {

    readonly mode?: DiscoveryExecutionMode;

}

export interface DiscoverCommandResult {

    readonly sessionId: string;

    readonly startedAt: Date;

    readonly mode: DiscoveryExecutionMode;

}

export interface DiscoverCommandContract {

    execute(

        request?: DiscoverCommandRequest

    ): Promise<DiscoverCommandResult>;

}
