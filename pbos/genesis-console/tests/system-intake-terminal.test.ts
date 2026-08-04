import { describe, expect, it } from "vitest";
import { GenesisControlPlane } from "../genesis-control-plane";
import { GenesisSystemCatalog } from "../system-catalog";
import { GenesisTerminal } from "../genesis-terminal";
import { TerminalIO } from "../terminal-io";

class IntakeTerminal implements TerminalIO {
    readonly output: string[] = [];
    private index = 0;
    constructor(private readonly answers: readonly string[]) {}
    write(message: string): void { this.output.push(message); }
    prompt(_message: string): Promise<string> { return Promise.resolve(this.answers[this.index++] ?? ""); }
    close(): void {}
}

describe("Genesis create-system intake", () => {
    it("collects mission, domain, autonomy, and brand into a reviewed blueprint", async () => {
        const io = new IntakeTerminal([
            "2",
            "Example Learning", "Scholar Network", "Improve opportunity readiness",
            "Scholars,Families", "Verified records,Opportunity access", "business-owner", "technical-owner",
            "1", "1,2,4,5", "1", "3",
            "1,8", "1",
            "uploads/scholar-brand-card.png", "uploads/scholar-logo.svg,uploads/scholar-icon.png",
            "Opportunity for every scholar", "Montserrat", "Inter", "Preserve clear space", "y",
            "", "", "", "3", "3", "2",
            "US-CA", "STUDENT_DATA", "FERPA"
        ]);
        const terminal = new GenesisTerminal(new GenesisControlPlane(new GenesisSystemCatalog()), io);
        expect(await terminal.run()).toBe(0);
        expect(io.output).toContain("CREATE NEW OPERATING SYSTEM");
        expect(io.output).toContain("Blueprint status: READY_FOR_APPROVAL");
        expect(io.output.some(line => line.startsWith("Primary: #"))).toBe(true);
        expect(io.output).toContain("Brand assets: 3");
    });
});
