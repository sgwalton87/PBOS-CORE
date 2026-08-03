import { describe, expect, it } from "vitest";

import { CompilerPipeline }

from "../compiler-pipeline";

describe(

    "PBOS Compiler Integration",

    () => {

        it(

            "executes the compiler",

            async () => {

                const pipeline =

                    new CompilerPipeline();

                const report =

                    await pipeline.execute();

                expect(

                    report.success

                ).toBe(true);

            }

        );

        it(

            "executes four compiler stages",

            async () => {

                const pipeline =

                    new CompilerPipeline();

                const report =

                    await pipeline.execute();

                expect(

                    report.stageCount

                ).toBe(4);

            }

        );

    }

);
