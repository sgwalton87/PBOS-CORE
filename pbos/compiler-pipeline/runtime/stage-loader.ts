/*
===============================================================================

PBOS Stage Loader

Authority

PBOS-CIP-003

===============================================================================
*/

import { StageRegistry }

from "./stage-registry";

import { BootStage }

from "../stages/boot-stage";

import { DiscoveryStage }

from "../stages/discovery-stage";

import { DiscoveryIntelligenceStage }

from "../stages/discovery-intelligence-stage";

import { OrganizationStage }

from "../stages/organization-stage";

export class StageLoader {

    load(): StageRegistry {

        const registry =

            new StageRegistry();

        registry.register(

            new BootStage()

        );

        registry.register(

            new DiscoveryStage()

        );

        registry.register(

            new DiscoveryIntelligenceStage()

        );

        registry.register(

            new OrganizationStage()

        );

        return registry;

    }

}
