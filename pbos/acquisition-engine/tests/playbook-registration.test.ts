import {

    describe,

    expect,

    it

}

from "vitest";


import {

    PlaybookRegistrationRuntime

}

from "../runtime/playbook-registration-runtime";



describe(

    "PBOS Playbook Registration Runtime",

    () => {


        it(

            "registers Playbook as a Genesis compilation target",

            () => {


                const runtime =

                    new PlaybookRegistrationRuntime();



                const target =

                    runtime.register();



                expect(

                    target.compilationReady

                ).toBe(

                    true

                );



                expect(

                    target.systemArtifact.systemName

                ).toBe(

                    "playbook-platform"

                );



                expect(

                    target.metadata.systemId

                ).toBe(

                    "PLAYBOOK-SYSTEM-001"

                );


            }

        );


    }

);
