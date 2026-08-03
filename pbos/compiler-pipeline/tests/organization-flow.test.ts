import {

    describe,

    expect,

    it

}

from "vitest";


import {

    CompilerPipeline

}

from "../compiler-pipeline";



describe(

    "PBOS Organization Pipeline",

    () => {


        it(

            "produces organization compilation output",

            async () => {


                const pipeline =

                    new CompilerPipeline();



                const report =

                    await pipeline.execute();



                expect(

                    report.success

                ).toBe(true);



                expect(

                    report.stages.length

                ).toBeGreaterThan(0);


            }

        );


    }

);
