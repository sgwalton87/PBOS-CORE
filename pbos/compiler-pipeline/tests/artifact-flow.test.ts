import { describe, expect, it } from "vitest";

import { ArtifactRegistry }

from "../../compiler-artifacts";

describe(

    "Artifact Flow",

    () => {

        it(

            "stores compiler artifacts",

            () => {

                const registry =

                    new ArtifactRegistry();

                expect(

                    registry.count()

                ).toBe(0);

            }

        );

    }

);
