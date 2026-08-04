import {

    describe,

    expect,

    it

}

from "vitest";


import {

    SystemCatalog

}

from "../catalog/system-catalog";


import {

    PlaybookCatalog

}

from "../catalog/playbook-catalog";



describe(

    "PBOS Genesis System Catalog",

    () => {


        it(

            "registers Playbook as a compilation target",

            () => {


                const catalog =

                    new SystemCatalog();



                const playbook =

                    new PlaybookCatalog();



                playbook.register(

                    catalog

                );



                const target =

                    catalog.find(

                        "PLAYBOOK-SYSTEM-001"

                    );



                expect(

                    target?.systemName

                ).toBe(

                    "Playbook Platform"

                );



                expect(

                    target?.lifecycleState

                ).toBe(

                    "REGISTERED"

                );


            }

        );


    }

);
