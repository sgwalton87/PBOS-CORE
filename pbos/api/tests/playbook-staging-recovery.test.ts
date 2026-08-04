import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CIP-045 Playbook cross-revision recovery command", () => {
    it("uses read-only status and audit operations without replaying activation mutations", () => {
        const source = readFileSync(resolve(process.cwd(), "pbos/tools/playbook-staging-recovery.ts"), "utf8");

        expect(source).toContain('client.connectorStatus');
        expect(source).toContain('client.domainStatus');
        expect(source).toContain('client.queryAudit');
        expect(source).not.toContain('client.registerSystem');
        expect(source).not.toContain('client.certifySystem');
        expect(source).not.toContain('client.exchangeApprovedData');
    });
});
