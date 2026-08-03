/*
===============================================================================

PBOS Organizational Ontology

Authority

PBOS-DI-010

Classification

Constitutional Ontology

===============================================================================

Purpose

Defines the constitutional vocabulary used by the Organizational Knowledge
Graph.

Every organizational entity SHALL conform to this ontology.

===============================================================================
*/

export enum OrganizationEntity {

    ORGANIZATION = "ORGANIZATION",

    PERSON = "PERSON",

    TEAM = "TEAM",

    ROLE = "ROLE",

    DEPARTMENT = "DEPARTMENT",

    CAPABILITY = "CAPABILITY",

    MISSION = "MISSION",

    OBJECTIVE = "OBJECTIVE",

    PROCESS = "PROCESS",

    WORKFLOW = "WORKFLOW",

    POLICY = "POLICY",

    APPLICATION = "APPLICATION",

    DATASET = "DATASET",

    RESOURCE = "RESOURCE",

    RISK = "RISK",

    OPPORTUNITY = "OPPORTUNITY"

}

export enum OrganizationRelationship {

    OWNS = "OWNS",

    DEPENDS_ON = "DEPENDS_ON",

    REPORTS_TO = "REPORTS_TO",

    SUPPORTS = "SUPPORTS",

    IMPLEMENTS = "IMPLEMENTS",

    USES = "USES",

    PRODUCES = "PRODUCES",

    CONSUMES = "CONSUMES",

    ALIGNS_WITH = "ALIGNS_WITH",

    ENABLES = "ENABLES",

    BLOCKS = "BLOCKS"

}
