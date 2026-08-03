/*
===============================================================================

PBOS Constitutional Acquisition Gateway

Purpose

The Acquisition Gateway is the constitutional front door of PBOS Genesis.

Every organization begins here.

Its responsibility is to determine how organizational understanding should be
acquired.

The Gateway SHALL NOT perform discovery.

The Gateway SHALL configure acquisition.

===============================================================================
*/

import { DiscoveryMode } from "./discovery-mode";

export class AcquisitionGateway {

    async begin(mode: DiscoveryMode) {

        throw new Error(
            "Acquisition Gateway not implemented."
        );

    }

}
