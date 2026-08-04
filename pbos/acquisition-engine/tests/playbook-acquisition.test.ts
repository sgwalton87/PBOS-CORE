import {

    describe,

    expect,

    it

}

from "vitest";


import {

    PlaybookAdapter

}

from "../adapters/playbook-adapter";



describe(

    "PBOS Playbook Acquisition",

    () => {


        it(

            "loads the Playbook Platform acquisition profile",

            () => {


                const adapter =

                    new PlaybookAdapter();



                const system =

                    adapter.acquireProfile();



                expect(

                    system.systemId

                ).toBe(

                    "PLAYBOOK-SYSTEM-001"

                );



                expect(

                    system.systemName

                ).toBe(

                    "Playbook Platform"

                );



                expect(

                    system.operatingDomains.length

                ).toBeGreaterThan(

                    0

                );


            }

        );


    }

);
