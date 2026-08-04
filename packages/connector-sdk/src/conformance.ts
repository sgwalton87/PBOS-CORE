import { ConnectorSdkClient } from "./client";
import { ConformanceReport, ConnectorManifest } from "./contracts";
import { parseConnectorManifest } from "./manifest";

export interface ConformanceIdentity { domainRegistrationId: string; identityMappingId: string; }
export class ConnectorConformanceRunner {
    constructor(private readonly client: ConnectorSdkClient) {}
    async run(input: ConnectorManifest, identity: ConformanceIdentity): Promise<ConformanceReport> {
        const manifest = parseConnectorManifest(input);
        const checks: { name: string; passed: boolean; details?: string }[] = [];
        for (const [name, operation] of [
            ["version", () => this.client.negotiate(manifest.connectorId)],
            ["status", () => this.client.status(manifest.connectorId)],
            ["capabilities", () => this.client.capabilities(manifest.connectorId, manifest.permissions)],
            ["health", () => this.client.health({ connectorId: manifest.connectorId, ...identity, purpose: "Connector conformance" })]
        ] as const) {
            try { const response = await operation(); checks.push({ name, passed: response.success,
                details: response.success ? undefined : response.error.message }); }
            catch (error) { checks.push({ name, passed: false, details: error instanceof Error ? error.message : String(error) }); }
        }
        return { manifest, passed: checks.every(check => check.passed), checks };
    }
}
