import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";

describe("partner-ready CLI durable state", () => {
    it("persists the Bulletproof catalog independently of a process", () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-cli-")), "state.json");
        const first = new GenesisStateRepository(path);
        first.saveSystem({ systemId: "BULLETPROOF-SYSTEM-001", operatingSystemId: "BULLETPROOF-OS-001", name: "Bulletproof Beneficiary",
            domain: "Legacy Planning", repository: "vycoywalton/bulletproof-beneficiary-registry", defaultBranch: "main", status: "READY", capabilities: ["IDENTITY"] });
        expect(new GenesisStateRepository(path).systems()[0].systemId).toBe("BULLETPROOF-SYSTEM-001");
    });

    it("refreshes a durable public name without changing the stable system identity", () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-cli-")), "state.json");
        const state = new GenesisStateRepository(path);
        state.saveSystem({ systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "Playbook Platform",
            domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY", capabilities: ["WORKFLOWS"] });
        state.saveSystem({ systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
            domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY", capabilities: ["WORKFLOWS"] });
        expect(new GenesisStateRepository(path).systems()).toEqual([
            expect.objectContaining({ systemId: "PLAYBOOK-SYSTEM-001", name: "The Playbook" })
        ]);
    });
});
