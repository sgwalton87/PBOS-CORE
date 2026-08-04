import {

    describe,

    expect,

    it

}

from "vitest";


import {

    PlaybookAcquisitionRuntime

}

from "../runtime/playbook-acquisition-runtime";



describe(

    "PBOS Playbook Acquisition Runtime",

    () => {


        it(

            "creates a Playbook system artifact",

            () => {


                const runtime =

                    new PlaybookAcquisitionRuntime();



                const artifact =

                    runtime.acquire();



                expect(

                    artifact.artifactType

                ).toBe(

                    "SYSTEM"

                );



                expect(

                    artifact.metadata.playbookSystemId

                ).toBe(

                    "PLAYBOOK-SYSTEM-001"

                );


                expect(

                    artifact.systemName

                ).toBe(

                    "playbook-platform"

                );


            }

        );


    }

);
