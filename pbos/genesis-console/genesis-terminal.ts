import { AuthorityMode } from "../autonomous-authority";
import { GenesisControlPlane } from "./genesis-control-plane";
import { TerminalIO } from "./terminal-io";
import { SystemIntakeTerminal } from "./system-intake-terminal";
import { GenesisWorkflowService } from "./genesis-workflow-service";

export interface SessionAuthorityProvider {
    authorize(systemId: string): Promise<{ operatorId: string; approvalId: string }>;
}

const MODES: readonly { mode: AuthorityMode; label: string }[] = [
    { mode: "READ_ONLY", label: "Read Only" },
    { mode: "HUMAN_GATED", label: "Human-Gated Build" },
    { mode: "DELEGATED_AUTONOMY", label: "Delegated Autonomous Build" }
];

export class GenesisTerminal {
    constructor(
        private readonly controlPlane: GenesisControlPlane,
        private readonly io: TerminalIO,
        private readonly intake = new SystemIntakeTerminal(),
        private readonly sessionAuthority?: SessionAuthorityProvider,
        private readonly workflows?: GenesisWorkflowService
    ) {}

    async run(): Promise<number> {
        try {
            this.io.write("PBOS GENESIS");
            this.io.write("System Factory Console\n");
            this.io.write("1. Activate Registered System");
            this.io.write("2. Create New Operating System");
            const operation = this.selection(await this.io.prompt("\nChoose an operation: "), 2);
            if (operation === 1) {
                await this.intake.collect(this.io);
                return 0;
            }
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

            this.io.write("");
            this.io.write(`System: ${system.name}`);
            this.io.write(`Repository: ${system.repository}`);
            this.io.write(`Authority: ${selectedMode.label}`);
            this.io.write("Branch scope: agent/*");
            this.io.write("Protected: merge, production deploy, destructive migration, secrets, certification, cross-repository work");
            const confirmed = (await this.io.prompt("\nAuthorize this build session? [y/N] ")).trim().toLowerCase();
            if (confirmed !== "y" && confirmed !== "yes") {
                this.io.write("Build session not authorized.");
                return 1;
            }
            const identity = this.sessionAuthority
                ? await this.sessionAuthority.authorize(system.systemId)
                : { operatorId: "GENESIS-TERMINAL-OPERATOR", approvalId: `terminal-approval-${Date.now()}` };
            const session = this.controlPlane.activateSystem(
                system.systemId,
                selectedMode.mode,
                identity.operatorId,
                identity.approvalId
            );
            this.io.write("");
            this.io.write("Build session active.");
            this.io.write(`Session: ${session.sessionId}`);
            this.io.write(`Grant: ${session.grant.grantId}`);
            this.io.write(`Expires: ${session.grant.expiresAt.toISOString()}`);
            this.io.write("Available: inspect, status, plan, propose, build, test preparation, documentation, commit, push, draft PR");
            if (this.workflows) await this.runWorkflow(session);
            return 0;
        } catch (error) {
            this.io.write(`Genesis console error: ${error instanceof Error ? error.message : String(error)}`);
            return 1;
        } finally {
            this.io.close();
        }
    }

    private async runWorkflow(session: import("./genesis-control-plane").GenesisBuildSession): Promise<void> {
        this.io.write("");
        this.io.write("1. Inspect repository and create build plan");
        this.io.write("2. Prepare application build on agent branch and open draft PR");
        this.io.write("3. Exit");
        const answer = (await this.io.prompt("Next action [3]: ")).trim();
        if (!answer || answer === "3") return;
        if (answer === "1") {
            const plan = await this.workflows!.inspectAndPlan(session);
            this.io.write(`Plan: ${plan.planId}`);
            this.io.write(`Status: ${plan.status}`);
            this.io.write(`Work packages: ${plan.workPackages.length}`);
            return;
        }
        if (answer === "2") {
            const build = await this.workflows!.prepareDraftBuild(session);
            this.io.write(`Branch: ${build.branch}`);
            this.io.write(`Draft PR: ${build.pullRequest.url}`);
            this.io.write("Stop: human validation and certification required before merge.");
            return;
        }
        throw new Error("Invalid workflow selection.");
    }

    private selection(value: string, count: number): number {
        const selected = Number.parseInt(value.trim(), 10) - 1;
        if (!Number.isInteger(selected) || selected < 0 || selected >= count) {
            throw new Error("Invalid terminal selection.");
        }
        return selected;
    }
}
