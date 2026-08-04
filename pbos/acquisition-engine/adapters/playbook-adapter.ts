/*
===============================================================================

PBOS Playbook Acquisition Adapter

Authority

PBOS-CIP-010B-003

Classification

Production System Adapter

===============================================================================
*/


import {

    PLAYBOOK_PROFILE

}

from "../profiles/playbook-profile";


import {

    PlaybookSystemContract

}

from "../contracts/playbook-system-contract";



export class PlaybookAdapter {



    acquireProfile():

        PlaybookSystemContract {



        return PLAYBOOK_PROFILE;


    }



    discoverFiles():

        readonly string[] {



        return [

            "package.json",

            "README.md",

            "app/",

            "components/",

            "lib/",

            "supabase/",

            "database/"

        ];


    }


}
