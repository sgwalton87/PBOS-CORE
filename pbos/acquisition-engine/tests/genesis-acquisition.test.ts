import {

    describe,

    expect,

    it

}

from "vitest";


import {

    PlaybookGenesisAdapter

}

from "../adapters/playbook-genesis-adapter";



describe(

    "PBOS Genesis Playbook Acquisition",

    () => {


        it(

            "creates a governed Playbook acquisition target",

            () => {


                const adapter =

                    new PlaybookGenesisAdapter();



                const result =

                    adapter.compileTarget();



                expect(

                    result.context.systemId

                ).toBe(

                    "PLAYBOOK-SYSTEM-001"

                );



                expect(

                    result.context.acquisitionMode

                ).toBe(

                    "READ_ONLY"

                );



                expect(

                    result.artifact.artifactType

                ).toBe(

                    "SYSTEM"

                );


            }

        );


    }

);
