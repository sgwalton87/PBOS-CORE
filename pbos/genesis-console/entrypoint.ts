import { BuildAuthorityService } from "../autonomous-authority";
import { GenesisControlPlane } from "./genesis-control-plane";
import { GenesisSystemCatalog } from "./system-catalog";
import { GenesisTerminal } from "./genesis-terminal";
import { REFERENCE_SYSTEMS } from "./system-definition";
import { NodeTerminalIO } from "./terminal-io";

const terminal = new GenesisTerminal(
    new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS), new BuildAuthorityService()),
    new NodeTerminalIO()
);

terminal.run().then(exitCode => {
    process.exitCode = exitCode;
});
