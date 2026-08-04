import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CIP-045 Playbook credential revocation and rotation evidence", () => {
    it("proves the retired and replacement credentials without exposing secrets", () => {
        const source = readFileSync(resolve(process.cwd(), "pbos/tools/playbook-staging-credential.ts"), "utf8");

        expect(source).toContain('"ACTIVE" | "REVOKED"');
        expect(source).toContain("response.status !== 401");
        expect(source).toContain("response.status !== 200");
        expect(source).toContain("CREDENTIAL_REVOKED");
        expect(source).toContain("PLAYBOOK-CREDENTIAL-ROTATION-20260804-001");
        expect(source).not.toContain("console.log(bootstrap");
        expect(source).not.toContain("JSON.stringify(bootstrap");
    });
});
