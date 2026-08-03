/*
===============================================================================

PBOS Constitutional Engine Template

Classification

Engine Template

Authority

PESS-005

===============================================================================

Purpose

The Constitutional Engine Template defines the minimum implementation
requirements for every PBOS Engine.

All Constitutional Engines SHALL inherit this structure to ensure
deterministic execution, governance, observability, certification,
and interoperability.

===============================================================================

Canonical Lifecycle

Initialize

↓

Validate

↓

Execute

↓

Report

↓

Certify

↓

Shutdown

===============================================================================

Constitutional Law

Every PBOS Engine SHALL:

• validate inputs

• fail closed

• preserve runtime context

• preserve evidence

• publish metrics

• support certification

===============================================================================
*/

export abstract class ConstitutionalEngine {

    abstract readonly id: string;

    abstract readonly name: string;

    abstract readonly version: string;

    async initialize(): Promise<void> {

        throw new Error(
            "Engine initialization not implemented."
        );

    }

    async validate(): Promise<void> {

        throw new Error(
            "Engine validation not implemented."
        );

    }

    async execute(): Promise<void> {

        throw new Error(
            "Engine execution not implemented."
        );

    }

    async report(): Promise<void> {

        throw new Error(
            "Engine reporting not implemented."
        );

    }

    async certify(): Promise<void> {

        throw new Error(
            "Engine certification not implemented."
        );

    }

    async shutdown(): Promise<void> {

        throw new Error(
            "Engine shutdown not implemented."
        );

    }

}
