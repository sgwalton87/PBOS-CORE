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
});
