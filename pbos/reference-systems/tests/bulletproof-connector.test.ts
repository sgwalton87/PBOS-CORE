import { describe, expect, it } from "vitest";
import { ConnectedSystemRegistry, DomainRegistrationRegistry } from "../../integration";
import { BULLETPROOF_CONNECTOR, BULLETPROOF_DOMAIN_REGISTRATION } from "../bulletproof";

describe("Bulletproof connector activation", () => {
    it("registers certified system, OS, connector, and legacy domain identities", () => {
        const systems = new ConnectedSystemRegistry();
        systems.register(BULLETPROOF_CONNECTOR);
        const domains = new DomainRegistrationRegistry(systems);
        domains.register(BULLETPROOF_DOMAIN_REGISTRATION);
        expect(systems.get("BULLETPROOF-CONNECTOR-001")?.externalSystemId).toBe("BULLETPROOF-SYSTEM-001");
        expect(systems.get("BULLETPROOF-CONNECTOR-001")?.pbosSystemId).toBe("BULLETPROOF-OS-001");
        expect(domains.get("BULLETPROOF-LEGACY-DOMAIN-001")?.status).toBe("ACTIVE");
    });
});
