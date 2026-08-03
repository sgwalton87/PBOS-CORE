import {

    describe,

    expect,

    it

}

from "vitest";


import {

    EvolutionRuntime

}

from "../runtime/evolution-runtime";



describe(

    "PBOS Evolution Engine",

    () => {


        it(

            "compiles an evolution model from execution history",

            () => {


                const runtime =

                    new EvolutionRuntime();



                const model =

                    runtime.compile(

                        "execution-001"

                    );



                expect(

                    model.sourceExecutionId

                ).toBe(

                    "execution-001"

                );



                expect(

                    model.observations.length

                ).toBeGreaterThan(

                    0

                );



                expect(

                    model.feedback.length

                ).toBeGreaterThan(

                    0

                );



                expect(

                    model.state.status

                ).toBe(

                    "EVALUATING"

                );


            }

        );


    }

);
