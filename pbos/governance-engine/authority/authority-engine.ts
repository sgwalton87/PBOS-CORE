/*
===============================================================================

PBOS Authority Engine

Authority

PBOS-CIP-009A-007

Classification

Governance Runtime

===============================================================================
*/


import {

    AuthorityContract

}

from "../contracts/authority-contract";



export class AuthorityEngine {



    create(

        name: string,

        level: AuthorityContract["level"],

        permissions: readonly string[]

    ): AuthorityContract {



        return {


            id:

                crypto.randomUUID(),


            name,


            level,


            permissions,


            active:

                true,


            createdAt:

                new Date(),


            metadata: {

                source:

                    "AuthorityEngine"

            }


        };


    }



    canAuthorize(

        authority: AuthorityContract,

        permission: string

    ): boolean {



        return (

            authority.active &&

            authority.permissions.includes(

                permission

            )

        );


    }


}
