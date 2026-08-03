/*
===============================================================================

PBOS Discovery Adapter Registry

Classification

Constitutional Registry

Authority

PBS-DSC

===============================================================================

Purpose

The Adapter Registry governs every Discovery Adapter available to PBOS
Genesis.

Adapters SHALL register before participating in Discovery.

The Registry SHALL resolve adapters according to Constitutional Execution
Mode.

===============================================================================
*/

import { DiscoveryExecutionMode } from "../types/discovery-session";

export class DiscoveryAdapterRegistry {

    async resolve(
        mode: DiscoveryExecutionMode
    ) {

        void mode;

        throw new Error(
            "Adapter resolution not implemented."
        );

    }

    async register() {

        throw new Error(
            "Adapter registration not implemented."
        );

    }

}
