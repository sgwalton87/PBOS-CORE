import { describe, expect, it } from "vitest";

import { CompilerPipeline }

from "../compiler-pipeline";

describe("Compiler Pipeline Integration", () => {

    it("executes successfully", async () => {

        const pipeline =

            new CompilerPipeline();

        const report =

            await pipeline.execute();

        expect(

            report.success

        ).toBe(true);

    });

    it("executes at least one stage", async () => {

        const pipeline =

            new CompilerPipeline();

        const report =

            await pipeline.execute();

        expect(

            report.stages.length

        ).toBeGreaterThan(0);

    });

});
