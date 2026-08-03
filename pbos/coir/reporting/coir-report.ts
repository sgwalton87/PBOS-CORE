/*
===============================================================================

PBOS COIR Report

Authority

PBOS-COIR-011

===============================================================================
*/

export interface CoirReport {

    readonly reportId: string;

    readonly organizationId: string;

    readonly compiledAt: Date;

    readonly compilerVersion: string;

    readonly successful: boolean;

}

export class CoirReporter {

    create(

        organizationId: string

    ): CoirReport {

        return {

            reportId:

                crypto.randomUUID(),

            organizationId,

            compiledAt:

                new Date(),

            compilerVersion:

                "1.0.0",

            successful: true

        };

    }

}
