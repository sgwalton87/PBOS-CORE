/*
===============================================================================

PBOS COIR Schema

Authority

PBOS-COIR-006

===============================================================================
*/

export interface CoirSchema {

    readonly version: string;

    readonly entities: readonly string[];

    readonly relationships: readonly string[];

    readonly metadata: readonly string[];

}

export const COIR_SCHEMA: CoirSchema = {

    version: "1.0.0",

    entities: [

        "Organization",

        "Person",

        "Team",

        "Role",

        "Capability",

        "Process"

    ],

    relationships: [

        "OWNS",

        "DEPENDS_ON",

        "REPORTS_TO",

        "SUPPORTS"

    ],

    metadata: [

        "Evidence",

        "Lineage",

        "Metrics"

    ]

};
