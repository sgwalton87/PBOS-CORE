/*
===============================================================================

PBOS Organizational Knowledge Graph

Classification

Knowledge Representation

Authority

PBS-ORG

===============================================================================

Purpose

Represent the relationships among organizational concepts discovered during
Constitutional Discovery.

The Knowledge Graph enables explainable reasoning across organizational
structure, capabilities, systems, governance, and evidence.

===============================================================================

Relationship Types

Organization

Capability

Role

Process

System

Policy

Evidence

Mission

Goal

===============================================================================

Constitutional Law

Relationships SHALL preserve provenance.

Knowledge SHALL remain explainable.

The graph SHALL never invent unsupported relationships.

===============================================================================
*/

export interface KnowledgeNode {

    readonly id: string;

    readonly type: string;

    readonly label: string;

}

export interface KnowledgeEdge {

    readonly source: string;

    readonly target: string;

    readonly relationship: string;

}

export interface KnowledgeGraph {

    readonly nodes: readonly KnowledgeNode[];

    readonly edges: readonly KnowledgeEdge[];

}
