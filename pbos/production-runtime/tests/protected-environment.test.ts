import { chmodSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { ProtectedEnvironmentResolver } from "../index";

const command = { command: "node", args: [] as string[], requiredEnvironmentVariables: ["PUBLIC_URL", "PRIVATE_SECRET"] };

describe("PBS-5000 protected functional environment", () => {
    it("resolves an allowlisted runtime environment from a mode-0600 dotenv file without exposing values in readiness", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-protected-env-"));
        const path = join(root, "acceptance.env");
        writeFileSync(path, "PUBLIC_URL=https://example.invalid\nPRIVATE_SECRET=do-not-log\nIGNORED_VALUE=ignored\n", { mode: 0o600 });
        const resolver = new ProtectedEnvironmentResolver({ PATH: "/usr/bin", UNRELATED_SECRET: "must-not-cross-runtime" });

        const readiness = await resolver.inspect([command], [{ path }]);
        const environment = await resolver.resolve([command], [{ path }]);

        expect(readiness).toEqual({ ready: true, required: ["PRIVATE_SECRET", "PUBLIC_URL"],
            available: ["PRIVATE_SECRET", "PUBLIC_URL"], missing: [], loadedFiles: [path] });
        expect(JSON.stringify(readiness)).not.toContain("do-not-log");
        expect(environment).toMatchObject({ PUBLIC_URL: "https://example.invalid", PRIVATE_SECRET: "do-not-log" });
        expect(environment.IGNORED_VALUE).toBeUndefined();
        expect(environment.UNRELATED_SECRET).toBeUndefined();
        expect(environment.PATH).toBe("/usr/bin");
    });

    it("fails closed on unsafe file permissions", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-protected-env-"));
        const path = join(root, "acceptance.env");
        writeFileSync(path, "PRIVATE_SECRET=secret\n", { mode: 0o600 });
        chmodSync(path, 0o644);
        await expect(new ProtectedEnvironmentResolver({}).inspect([command], [{ path }]))
            .rejects.toThrow("permissions are unsafe");
    });

    it("reports only missing variable names and rejects public injection into protected names", async () => {
        const resolver = new ProtectedEnvironmentResolver({ PUBLIC_URL: "https://example.invalid" });
        const readiness = await resolver.inspect([command]);
        expect(readiness).toMatchObject({ ready: false, missing: ["PRIVATE_SECRET"] });
        await expect(resolver.resolve([{ ...command, publicEnvironment: { PRIVATE_SECRET: "not-protected" } }]))
            .rejects.toThrow("Protected environment PRIVATE_SECRET cannot be supplied as public");
    });
});
