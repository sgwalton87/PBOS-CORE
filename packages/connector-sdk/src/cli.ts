#!/usr/bin/env node
import { readFileSync } from "fs";
import { ConnectorSdkClient } from "./client";
import { ConnectorConformanceRunner } from "./conformance";
import { parseConnectorManifest } from "./manifest";
import { SignedPbosServerTransport } from "./server";

async function main(): Promise<void> {
    const manifestPath = process.argv[2];
    if (!manifestPath) throw new Error("Usage: pbos-connector-conformance <manifest.json>");
    const required = ["PBOS_API_URL", "PBOS_ORGANIZATION_ID", "PBOS_KEY_ID", "PBOS_CONNECTOR_SECRET",
        "PBOS_DOMAIN_REGISTRATION_ID", "PBOS_IDENTITY_MAPPING_ID"] as const;
    const missing = required.filter(name => !process.env[name]);
    if (missing.length) throw new Error(`Missing conformance environment: ${missing.join(", ")}`);
    const manifest = parseConnectorManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
    const transport = new SignedPbosServerTransport(process.env.PBOS_API_URL!, {
        organizationId: process.env.PBOS_ORGANIZATION_ID!, connectorId: manifest.connectorId,
        keyId: process.env.PBOS_KEY_ID!, secret: Buffer.from(process.env.PBOS_CONNECTOR_SECRET!, "base64")
    }, async (url, init) => globalThis.fetch(url, init));
    const report = await new ConnectorConformanceRunner(new ConnectorSdkClient(transport, { maximumAttempts: 3 })).run(manifest, {
        domainRegistrationId: process.env.PBOS_DOMAIN_REGISTRATION_ID!, identityMappingId: process.env.PBOS_IDENTITY_MAPPING_ID!
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.passed) process.exitCode = 1;
}
main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
