/*
===============================================================================

PBOS Template Registry

Classification

Engineering Registry

Authority

PESS-001

===============================================================================

Purpose

The Template Registry maintains every Constitutional Engine Template available
within PBOS Genesis.

Templates SHALL be immutable.

Templates SHALL remain versioned.

Templates SHALL remain certifiable.

===============================================================================
*/

export interface EngineTemplate {

    readonly id: string;

    readonly domain: string;

    readonly version: string;

    readonly classification: string;

}

export class TemplateRegistry {

    async register() {

        throw new Error(
            "Template registration not implemented."
        );

    }

    async resolve() {

        throw new Error(
            "Template resolution not implemented."
        );

    }

}
