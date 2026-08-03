/*
===============================================================================

PBOS Organizational Process Model

Classification

Constitutional Model

Authority

PBS-ORG

===============================================================================

Purpose

Processes describe HOW organizational capabilities are executed.

Processes connect:

Roles

↓

Capabilities

↓

Workflows

↓

Outcomes

Processes become the constitutional blueprint for automation.

===============================================================================

Constitutional Law

Processes SHALL preserve organizational intent.

Automation SHALL implement processes.

Automation SHALL NOT redefine organizational purpose.

===============================================================================
*/

export interface ProcessModel {

    readonly processId: string;

    readonly name: string;

    readonly capability: string;

    readonly ownerRole: string;

    readonly inputs: readonly string[];

    readonly outputs: readonly string[];

}
