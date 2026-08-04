import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageManifest {
    readonly main?: string;
    readonly types?: string;
    readonly files?: readonly string[];
    readonly scripts?: Readonly<Record<string, string>>;
}

describe("CIP-045 connector SDK release artifact", () => {
    it("builds compiled entrypoints before npm creates the package", () => {
        const manifest = JSON.parse(readFileSync(
            resolve(__dirname, "../package.json"),
            "utf8"
        )) as PackageManifest;

        expect(manifest.main).toBe("dist/index.js");
        expect(manifest.types).toBe("dist/index.d.ts");
        expect(manifest.files).toContain("dist");
        expect(manifest.scripts?.build).toBe("tsc -p tsconfig.json");
        expect(manifest.scripts?.prepack).toBe("npm run build");
    });
});
