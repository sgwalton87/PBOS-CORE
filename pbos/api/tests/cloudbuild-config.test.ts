import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CIP-047 Cloud Build configuration", () => {
    it("quotes substitution variables in block sequences for valid YAML parsing", () => {
        const configuration = readFileSync(resolve(process.cwd(), "cloudbuild.yaml"), "utf8");

        expect(configuration).not.toContain("args: [");
        expect(configuration.match(/'\$\{_IMAGE\}'/g)).toHaveLength(3);
    });

    it("builds and executes a compiled runtime artifact", () => {
        const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");

        expect(dockerfile).toContain("RUN npm run build:cloud-run");
        expect(dockerfile).toContain("COPY --from=build /app/dist ./dist");
        expect(dockerfile).toContain('CMD ["node", "dist/pbos/api/cloud-run-entrypoint.js"]');
        expect(dockerfile).not.toContain('"tsx"');
    });
});
