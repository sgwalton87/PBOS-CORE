import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CIP-045 governed Playbook lifecycle evidence", () => {
    it("keeps suspension, denial verification, and resume as explicit modes", () => {
        const source = readFileSync(resolve(process.cwd(), "pbos/tools/playbook-staging-lifecycle.ts"), "utf8");

        expect(source).toContain('"SUSPEND" | "VERIFY_DENIED" | "RESUME"');
        expect(source).toContain("client.suspendSystem");
        expect(source).toContain("client.resumeSystem");
        expect(source).toContain("client.healthCheck");
        expect(source).toContain("Suspended Playbook connector did not produce the required runtime denial");
        expect(source).not.toContain("client.revokeSystem");
    });
});
