import { describe, expect, it } from "vitest";
import { GenesisControlPlane } from "../genesis-control-plane";
import { GenesisSystemCatalog } from "../system-catalog";
import { GenesisTerminal } from "../genesis-terminal";
import { REFERENCE_SYSTEMS } from "../system-definition";
import { TerminalIO } from "../terminal-io";

class FakeTerminal implements TerminalIO {
    readonly output: string[] = [];
    private index = 0;

    constructor(private readonly answers: readonly string[]) {}
    write(message: string): void { this.output.push(message); }
    prompt(_message: string): Promise<string> { return Promise.resolve(this.answers[this.index++] ?? ""); }
    close(): void {}
}

describe("Genesis terminal control plane", () => {
    it("registers Playbook and Bulletproof as independent selectable systems", () => {
        const control = new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS));
        expect(control.listSystems().map(system => system.systemId)).toEqual([
            "PLAYBOOK-SYSTEM-001", "BULLETPROOF-SYSTEM-001"
        ]);
        expect(control.listSystems()[0].repository).not.toBe(control.listSystems()[1].repository);
    });

    it("activates Playbook with delegated autonomous build authority", async () => {
        const io = new FakeTerminal(["1", "3", "yes"]);
        const terminal = new GenesisTerminal(
            new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS)), io
        );
        expect(await terminal.run()).toBe(0);
        expect(io.output).toContain("Authority: Delegated Autonomous Build");
        expect(io.output).toContain("Build session active.");
    });

    it("supports Bulletproof selection without activating Playbook", async () => {
        const io = new FakeTerminal(["2", "1", "y"]);
        const terminal = new GenesisTerminal(
            new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS)), io
        );
        expect(await terminal.run()).toBe(0);
        expect(io.output).toContain("System: Bulletproof Beneficiary");
        expect(io.output).toContain("Authority: Read Only");
    });

    it("creates an enforceable grant for the selected system", () => {
        const control = new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS));
        const session = control.activateSystem(
            "PLAYBOOK-SYSTEM-001", "DELEGATED_AUTONOMY", "operator", "session-approval"
        );
        expect(control.authorizeAction(
            session.sessionId, "MODIFY_APPLICATION_CODE", "MEDIUM", "agent/scholar-onboarding"
        ).allowed).toBe(true);
        expect(control.authorizeAction(
            session.sessionId, "MODIFY_APPLICATION_CODE", "MEDIUM", "main"
        ).allowed).toBe(false);
    });
});
