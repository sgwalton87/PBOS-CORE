import { describe, expect, it } from "vitest";

import { StageRegistry } from "../runtime/stage-registry";

import { BootStage } from "../stages/boot-stage";

describe("PBOS Stage Registry", () => {

    it("registers pipeline stages", () => {

        const registry = new StageRegistry();

        registry.register(

            new BootStage()

        );

        expect(

            registry.getAll().length

        ).toBe(1);

    });

    it("returns stages in execution order", () => {

        const registry = new StageRegistry();

        registry.register(

            new BootStage()

        );

        expect(

            registry.getAll()[0].id

        ).toBe("boot");

    });

});
