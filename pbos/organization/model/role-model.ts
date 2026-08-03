/*
===============================================================================

PBOS Organizational Role Model

Classification

Constitutional Model

Authority

PBS-ORG

===============================================================================

Purpose

Roles represent constitutional responsibility within an organization.

Roles own authority.

People temporarily occupy roles.

Engineering SHALL preserve role semantics independent of personnel.

===============================================================================

Constitutional Law

Organizations SHALL be modeled around roles rather than individuals.

Authority SHALL belong to roles.

Responsibilities SHALL remain traceable.

===============================================================================
*/

export interface RoleModel {

    readonly roleId: string;

    readonly title: string;

    readonly responsibilities: readonly string[];

    readonly authorities: readonly string[];

    readonly capabilities: readonly string[];

}
