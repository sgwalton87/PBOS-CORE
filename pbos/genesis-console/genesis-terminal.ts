import { AuthorityMode } from "../autonomous-authority";
import { GenesisControlPlane } from "./genesis-control-plane";
import { TerminalIO } from "./terminal-io";

const MODES: readonly { mode: AuthorityMode; label: string }[] = [
    { mode: "READ_ONLY", label: "Read Only" },
    { mode: "HUMAN_GATED", label: "Human-Gated Build" },
    { mode: "DELEGATED_AUTONOMY", label: "Delegated Autonomous Build" }
];

export class GenesisTerminal {
    constructor(private readonly controlPlane: GenesisControlPlane, private readonly io: TerminalIO) {}

    async run(): Promise<number> {
        try {
            this.io.write("PBOS GENESIS");
            this.io.write("System Factory Console\n");
            const systems = this.controlPlane.listSystems();
            systems.forEach((system, index) => {
                this.io.write(`${index + 1}. ${system.name}`);
                this.io.write(`   ${system.systemId} | ${system.domain} | ${system.status}`);
            });
            const systemIndex = this.selection(await this.io.prompt("\nSelect a registered system: "), systems.length);
            const system = systems[systemIndex];

            this.io.write("\nSelect authority mode:");
            MODES.forEach((entry, index) => this.io.write(`${index + 1}. ${entry.label}`));
            const modeIndex = this.selection(await this.io.prompt("\nAuthority mode: "), MODES.length);
            const selectedMode = MODES[modeIndex];

            this.io.write(`\nSystem: ${system.name}`);
            this.io.write(`Repository: ${system.repository}`);
            this.io.write(`Authority: ${selectedMode.label}`);
            this.io.write("Branch scope: agent/*");
            this.io.write("Protected: merge, production deploy, destructive migration, secrets, certification, cross-repository work");
            const confirmed = (await this.io.prompt("\nAuthorize this build session? [y/N] ")).trim().toLowerCase();
            if (confirmed !== "y" && confirmed !== "yes") {
                this.io.write("Build session not authorized.");
                return 1;
            }
            const session = this.controlPlane.activateSystem(
                system.systemId,
                selectedMode.mode,
                "GENESIS-TERMINAL-OPERATOR",
                `terminal-approval-${Date.now()}`
            );
            this.io.write("\nBuild session active.");
            this.io.write(`Session: ${session.sessionId}`);
            this.io.write(`Grant: ${session.grant.grantId}`);
            this.io.write(`Expires: ${session.grant.expiresAt.toISOString()}`);
            this.io.write("Available: inspect, status, plan, propose, build, test preparation, documentation, commit, push, draft PR");
            return 0;
        } catch (error) {
            this.io.write(`Genesis console error: ${error instanceof Error ? error.message : String(error)}`);
            return 1;
        } finally {
            this.io.close();
        }
    }

    private selection(value: string, count: number): number {
        const selected = Number.parseInt(value.trim(), 10) - 1;
        if (!Number.isInteger(selected) || selected < 0 || selected >= count) {
            throw new Error("Invalid terminal selection.");
        }
        return selected;
    }
}
