import {

    describe,

    expect,

    it

}

from "vitest";


import {

    AcquisitionRuntime

}

from "../runtime/acquisition-runtime";


describe(

    "PBOS Acquisition Engine",

    () => {


        it(

            "acquires an external system repository",

            () => {


                const runtime =

                    new AcquisitionRuntime();



                const artifact =

                    runtime.acquire(

                        "/projects/playbook-platform",

                        [

                            "package.json",

                            "README.md",

                            "schema.sql",

                            "migration.sql"

                        ]

                    );



                expect(

                    artifact.artifactType

                ).toBe(

                    "SYSTEM"

                );



                expect(

                    artifact.systemName

                ).toBe(

                    "playbook-platform"

                );



                expect(

                    artifact.dependencies.length

                ).toBeGreaterThanOrEqual(

                    0

                );


            }

        );


    }

);
