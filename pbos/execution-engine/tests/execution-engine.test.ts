import {

    describe,

    expect,

    it

}

from "vitest";


import {

    ExecutionRuntime

}

from "../runtime/execution-runtime";



describe(

    "PBOS Execution Runtime Engine",

    () => {


        it(

            "compiles an executable runtime model",

            () => {


                const runtime =

                    new ExecutionRuntime();



                const model =

                    runtime.compile(

                        "Scholar Runtime",

                        "scholar-os-001"

                    );



                expect(

                    model.name

                ).toBe(

                    "Scholar Runtime"

                );


                expect(

                    model.actors.length

                ).toBeGreaterThan(

                    0

                );


                expect(

                    model.workflows.length

                ).toBeGreaterThan(

                    0

                );


                expect(

                    model.state.status

                ).toBe(

                    "READY"

                );


            }

        );


    }

);
