import { describe, expect, it } from "vitest";
import { ConnectorConformanceRunner, ConnectorSdkClient, PbosSandboxTransport } from "../src";

const systems = [
    { connectorId: "PLAYBOOK-CONNECTOR-001", externalSystemId: "PLAYBOOK-SYSTEM-001", pbosSystemId: "PLAYBOOK-OS-001",
        name: "Playbook", version: "1.0.0", domainIds: ["PLAYBOOK-DOMAIN-SCHOLAR"], permissions: ["READ_RUNTIME_HEALTH"], communicationRules: ["HEALTH_CHECK"] },
    { connectorId: "BULLETPROOF-CONNECTOR-001", externalSystemId: "BULLETPROOF-SYSTEM-001", pbosSystemId: "BULLETPROOF-OS-001",
        name: "Bulletproof", version: "1.0.0", domainIds: ["LEGACY-PLANNING"], permissions: ["READ_RUNTIME_HEALTH"], communicationRules: ["HEALTH_CHECK"] }
];

describe("CIP-043 connector SDK conformance", () => {
    it.each(systems)("passes an independent $name consumer through conformance", async manifest => {
        const sandbox = new PbosSandboxTransport({ NEGOTIATE_VERSION: () => ({ apiVersion: "v1" }),
            GET_CONNECTOR_STATUS: () => ({ status: "ACTIVE" }), DISCOVER_CAPABILITIES: () => [],
            HEALTH_CHECK: () => ({ healthy: true }) });
        const client = new ConnectorSdkClient(sandbox, { correlationId: () => "correlation" });
        const report = await new ConnectorConformanceRunner(client).run(manifest, {
            domainRegistrationId: `${manifest.connectorId}-DOMAIN`, identityMappingId: `${manifest.connectorId}-IDENTITY`
        });
        expect(report.passed).toBe(true);
        expect(report.checks).toHaveLength(4);
    });

    it("fails malformed manifests and reports missing sandbox capabilities", async () => {
        const client = new ConnectorSdkClient(new PbosSandboxTransport({}), { correlationId: () => "correlation" });
        await expect(new ConnectorConformanceRunner(client).run({ ...systems[0], version: "latest" }, {
            domainRegistrationId: "domain", identityMappingId: "identity"
        })).rejects.toThrow();
    });
});
