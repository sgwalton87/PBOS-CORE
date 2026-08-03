/*
===============================================================================

PBOS Organizational Knowledge Graph

Authority

PBOS-DI-009

===============================================================================

Purpose

Represent constitutional organizational knowledge.

The Knowledge Graph SHALL become the canonical organizational representation
consumed by downstream compiler stages.

===============================================================================
*/

export interface KnowledgeNode {

    readonly id: string;

    readonly label: string;

    readonly type: string;

}

export interface KnowledgeEdge {

    readonly source: string;

    readonly target: string;

    readonly relationship: string;

}

export class OrganizationalKnowledgeGraph {

    readonly nodes: KnowledgeNode[] = [];

    readonly edges: KnowledgeEdge[] = [];

    addNode(

        node: KnowledgeNode

    ): void {

        this.nodes.push(node);

    }

    addEdge(

        edge: KnowledgeEdge

    ): void {

        this.edges.push(edge);

    }

}
