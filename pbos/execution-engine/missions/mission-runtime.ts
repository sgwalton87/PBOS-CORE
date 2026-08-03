/*
===============================================================================

PBOS Mission Runtime

Authority

PBOS-CIP-007A-007

Classification

Execution Runtime

===============================================================================
*/


export interface MissionExecution {


    readonly id: string;


    readonly missionId: string;


    readonly status:

        "READY"

        | "ACTIVE"

        | "COMPLETED"

        | "FAILED";


    readonly startedAt: Date;


}



export class MissionRuntime {



    activate(

        missionId: string

    ): MissionExecution {



        return {


            id:

                crypto.randomUUID(),


            missionId,


            status:

                "ACTIVE",


            startedAt:

                new Date()


        };


    }


}
