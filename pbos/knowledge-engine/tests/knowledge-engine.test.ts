import { describe, expect, it } from "vitest";

import {

    KnowledgeRuntime

}

from "../runtime/knowledge-runtime";


describe(

    "PBOS Knowledge Engine",

    () => {


        it(

            "compiles evidence into knowledge graph",

            () => {


                const runtime =

                    new KnowledgeRuntime();



                const graph =

                    runtime.compile({

                        id:

                            "evidence-001",


                        artifactType:

                            "EVIDENCE",


                        schemaVersion:

                            "1.0.0",


                        compilerVersion:

                            "1.0.0",


                        producedBy:

                            "test",


                        producedAt:

                            new Date(),


                        sessionId:

                            "session-001",


                        lineageId:

                            "lineage-001",


                        metadata: {},


                        source:

                            "test",


                        confidence:

                            1,


                        evidenceType:

                            "DISCOVERY",


                        content:

                            {

                                organization:

                                    "PBOS"

                            }

                    });



                expect(

                    graph.entities.length

                ).toBe(1);



                expect(

                    graph.confidence

                ).toBe(1);


            }

        );


    }

);
