import {

    describe,

    expect,

    it

}

from "vitest";


import {

    OperatingSystemRuntime

}

from "../runtime/os-runtime";



describe(

    "PBOS Operating System Engine",

    () => {


        it(

            "compiles an operating system from organizational inputs",

            () => {


                const runtime =

                    new OperatingSystemRuntime();



                const model =

                    runtime.compile(

                        "Scholar OS",

                        "organization-001",

                        [

                            "capability-001"

                        ]

                    );



                expect(

                    model.name

                ).toBe(

                    "Scholar OS"

                );



                expect(

                    model.missions.length

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
