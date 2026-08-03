/*
===============================================================================

PBOS Discover Command

Authority

PBS-CMD-DSC

Classification

Constitutional Command

===============================================================================
*/

import { Banner }
from "../../cli/ui/banner";

import { DiscoveryMenu }
from "../../cli/ui/menu";

import { DiscoverSession }
from "./session/discover-session";

import { DiscoverRuntime }
from "./runtime/discover-runtime";

import {
    DiscoverCommandResult
}
from "./contracts/discover-command-contract";

export class DiscoverCommand {

    async execute():
    Promise<DiscoverCommandResult> {

        const banner =
            new Banner();

        banner.render();

        const menu =
            new DiscoveryMenu();

        const mode =
            await menu.prompt();

        const session =
            new DiscoverSession(
                mode
            );

        const runtime =
            new DiscoverRuntime();

        await runtime.initialize(
            session
        );

        return {

            sessionId:
                session.id,

            startedAt:
                session.startedAt,

            mode

        };

    }

}
