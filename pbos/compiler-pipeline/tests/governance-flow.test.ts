import {

    describe,

    expect,

    it

}

from "vitest";


import {

    GovernanceRuntime

}

from "../../governance-engine";



describe(

    "PBOS Governance Pipeline",

    () => {


        it(

            "creates governed evolution decisions",

            () => {


                const runtime =

                    new GovernanceRuntime();



                const model =

                    runtime.compile(

                        "evolution-change-001"

                    );



                expect(

                    model.authorities.length

                ).toBeGreaterThan(

                    0

                );



                expect(

                    model.decisions.length

                ).toBeGreaterThan(

                    0

                );



                expect(

                    model.decisions[0].status

                ).toBe(

                    "AUTHORIZED"

                );


            }

        );


    }

);
