import {

    describe,

    expect,

    it

}

from "vitest";


import {

    ExecutionRuntime

}

from "../../execution-engine";



describe(

    "PBOS Execution Pipeline",

    () => {


        it(

            "compiles an execution runtime model",

            () => {


                const runtime =

                    new ExecutionRuntime();



                const model =

                    runtime.compile(

                        "Scholar Execution",

                        "scholar-os-001"

                    );



                expect(

                    model.name

                ).toBe(

                    "Scholar Execution"

                );



                expect(

                    model.state.status

                ).toBe(

                    "READY"

                );


                expect(

                    model.actors.length

                ).toBeGreaterThan(

                    0

                );


            }

        );


    }

);
