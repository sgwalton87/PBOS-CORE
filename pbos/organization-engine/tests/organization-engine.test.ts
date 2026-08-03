import {

    describe,

    expect,

    it

}

from "vitest";


import {

    OrganizationRuntime

}

from "../runtime/organization-runtime";



describe(

    "PBOS Organization Engine",

    () => {


        it(

            "compiles knowledge into an organization model",

            () => {


                const runtime =

                    new OrganizationRuntime();



                const model =

                    runtime.compile(

                        "PBOS",

                        [

                            "knowledge-001"

                        ]

                    );



                expect(

                    model.name

                ).toBe(

                    "PBOS"

                );



                expect(

                    model.capabilities.length

                ).toBeGreaterThan(

                    0

                );



                expect(

                    model.roles.length

                ).toBeGreaterThan(

                    0

                );



                expect(

                    model.workflows.length

                ).toBeGreaterThan(

                    0

                );


            }

        );


    }

);
