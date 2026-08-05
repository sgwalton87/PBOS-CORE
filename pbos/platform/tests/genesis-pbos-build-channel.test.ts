import { describe, expect, it } from "vitest";
import { BULLETPROOF_CONNECTOR_MANIFEST, BULLETPROOF_DOMAIN_MANIFEST,
    PLAYBOOK_CONNECTOR_MANIFEST, PLAYBOOK_DOMAIN_MANIFEST } from "../../reference-systems";
import { GenesisPbosBuildChannel } from "../genesis-pbos-build-channel";

describe("Genesis to PBOS v1 build channel", () => {
    it("binds Genesis, PBOS v1, The Playbook, and its repository into one governed channel", () => {
        const channel = new GenesisPbosBuildChannel().open({
            target: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001",
                repository: "sgwalton87/playbook-platform", defaultBranch: "main" },
            session: { sessionId: "session", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform" },
            grant: { grantId: "grant", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform", mode: "DELEGATED_AUTONOMY" },
            connector: PLAYBOOK_CONNECTOR_MANIFEST, domains: [PLAYBOOK_DOMAIN_MANIFEST]
        });
        expect(channel).toMatchObject({ factory: "PBOS_GENESIS", runtime: "PBOS_V1",
            systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001",
            connectorId: "PLAYBOOK-CONNECTOR-001", repository: "sgwalton87/playbook-platform" });
        expect(channel.capabilityIds).toContain("PLAYBOOK-SCHOLAR-JOURNEY");
    });

    it("supports an independent Bulletproof channel without identity or domain leakage", () => {
        const channel = new GenesisPbosBuildChannel().open({
            target: { systemId: "BULLETPROOF-SYSTEM-001", operatingSystemId: "BULLETPROOF-OS-001",
                repository: "vycoywalton/bulletproof-beneficiary-registry", defaultBranch: "main" },
            session: { sessionId: "session", systemId: "BULLETPROOF-SYSTEM-001", repository: "vycoywalton/bulletproof-beneficiary-registry" },
            grant: { grantId: "grant", systemId: "BULLETPROOF-SYSTEM-001", repository: "vycoywalton/bulletproof-beneficiary-registry", mode: "HUMAN_GATED" },
            connector: BULLETPROOF_CONNECTOR_MANIFEST, domains: [BULLETPROOF_DOMAIN_MANIFEST]
        });
        expect(channel.connectorId).toBe("BULLETPROOF-CONNECTOR-001");
        expect(channel.capabilityIds).toContain("BENEFICIARY_SEARCH");
        expect(channel.capabilityIds).not.toContain("PLAYBOOK-SCHOLAR-JOURNEY");
    });

    it("fails closed for read-only authority or crossed system identities", () => {
        const base = {
            target: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001",
                repository: "sgwalton87/playbook-platform", defaultBranch: "main" },
            session: { sessionId: "session", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform" },
            grant: { grantId: "grant", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform", mode: "DELEGATED_AUTONOMY" as const },
            connector: PLAYBOOK_CONNECTOR_MANIFEST, domains: [PLAYBOOK_DOMAIN_MANIFEST]
        };
        expect(() => new GenesisPbosBuildChannel().open({ ...base, grant: { ...base.grant, mode: "READ_ONLY" } })).toThrow("require Human-Gated");
        expect(() => new GenesisPbosBuildChannel().open({ ...base, connector: BULLETPROOF_CONNECTOR_MANIFEST,
            domains: [BULLETPROOF_DOMAIN_MANIFEST] })).toThrow("identity does not match");
        expect(() => new GenesisPbosBuildChannel().open({ ...base,
            grant: { ...base.grant, systemId: "BULLETPROOF-SYSTEM-001" } })).toThrow("crossed");
    });
});
