import {

    describe,

    expect,

    it

}

from "vitest";


import {

    SystemRegistry

}

from "../registry/system-registry";


import {

    PlaybookTarget

}

from "../targets/playbook-target";



describe(

    "PBOS System Registry",

    () => {


        it(

            "registers Playbook as a Genesis system",

            () => {


                const registry =

                    new SystemRegistry();



                const target =

                    new PlaybookTarget();



                const system =

                    target.create();



                registry.register(

                    system

                );



                const stored =

                    registry.get(

                        "PLAYBOOK-SYSTEM-001"

                    );



                expect(

                    stored?.lifecycleState

                ).toBe(

                    "REGISTERED"

                );


            }

        );


    }

);
