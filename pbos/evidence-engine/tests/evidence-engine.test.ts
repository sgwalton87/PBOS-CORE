import { describe, expect, it } from "vitest";

import {
    EvidenceRuntime
}
from "../runtime/evidence-runtime";


import {
    DocumentCollector
}
from "../collectors/document-collector";


describe(
    "PBOS Evidence Engine",

    () => {


        it(
            "collects, normalizes, and validates evidence",

            () => {


                const collector =
                    new DocumentCollector();


                const evidence =
                    collector.collect(

                        {

                            id:
                                "source-001",

                            type:
                                "DOCUMENT",

                            name:
                                "Test Document",

                            description:
                                "Evidence source",

                            verified:
                                true,

                            metadata: {}

                        },

                        {

                            content:
                                "PBOS Evidence"

                        }

                    );


                const runtime =
                    new EvidenceRuntime();


                const result =
                    runtime.process(
                        evidence
                    );


                expect(
                    result.valid
                ).toBe(true);


                expect(
                    result.evidence.status
                ).toBe("VALIDATED");


                expect(
                    result.confidence
                ).toBe(1);

            }

        );


    }

);
