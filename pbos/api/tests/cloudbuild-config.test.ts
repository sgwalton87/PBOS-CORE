import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CIP-047 Cloud Build configuration", () => {
    it("quotes substitution variables in block sequences for valid YAML parsing", () => {
        const configuration = readFileSync(resolve(process.cwd(), "cloudbuild.yaml"), "utf8");

        expect(configuration).not.toContain("args: [");
        expect(configuration.match(/'\$\{_IMAGE\}'/g)).toHaveLength(3);
    });
});
