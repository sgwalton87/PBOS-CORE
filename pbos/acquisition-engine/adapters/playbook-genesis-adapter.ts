/*
===============================================================================

PBOS Playbook Genesis Adapter

Authority

PBOS-CIP-010B-008

Classification

Genesis Integration Adapter

===============================================================================
*/


import {

    GenesisAcquisitionRuntime

}

from "../runtime/genesis-acquisition-runtime";



export class PlaybookGenesisAdapter {



    private readonly runtime =

        new GenesisAcquisitionRuntime();




    compileTarget() {



        return this.runtime.acquirePlaybook();


    }


}
