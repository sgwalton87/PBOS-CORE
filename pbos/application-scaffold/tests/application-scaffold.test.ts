import { describe, expect, it } from "vitest";
import { createPlaybookBlueprint } from "../../reference-systems";
import { SystemBlueprintFactory } from "../../system-blueprint";
import { ApplicationScaffoldGenerator } from "../index";

const blueprint = new SystemBlueprintFactory().create({ organizationName: "Bulletproof", systemName: "Bulletproof Beneficiary", mission: "Protect family legacy.",
    users: ["Members"], desiredOutcomes: ["Policy discovery"], domain: "LEGACY_PLANNING", capabilities: ["IDENTITY", "WORKFLOWS", "DOCUMENTS"],
    applicationStrategy: "CONNECT_EXISTING", existingRepository: "vycoywalton/bulletproof-beneficiary-registry", autonomyMode: "HUMAN_GATED",
    businessOwner: "Viveca", technicalOwner: "PBOS", operatingRegions: ["US"], dataClassifications: ["BENEFICIARY_DATA"], regulatoryFrameworks: ["HUMAN_REVIEW"],
    brand: { personalities: ["TRUSTWORTHY"], visualDirection: "EXISTING_BRAND", theme: "BOTH", cornerStyle: "ROUNDED", density: "COMFORTABLE",
        tagline: "Built to Leave a Legacy.", headingFont: "Inter", bodyFont: "Inter",
        assets: [{ assetId: "BULLETPROOF-LOGO-CARD-001", kind: "LOGO_CARD",
            location: "brand/bulletproof-logo-card.png", rightsConfirmed: true }] } });

describe("application scaffold generator", () => {
    it("generates a non-destructive Bulletproof overlay for an existing application", () => {
        const scaffold = new ApplicationScaffoldGenerator().generate({ blueprint, includeFirstVerticalSlice: true });
        const paths = scaffold.files.map(file => file.path);
        expect(scaffold.mode).toBe("EXISTING_APPLICATION_OVERLAY");
        expect(paths).toContain("pbos/generated/design/brand-source.json");
        expect(paths).toContain("pbos/generated/domain/legacy/vertical-slice.ts");
        expect(paths).not.toContain("package.json");
        expect(paths).not.toContain("package-lock.json");
        expect(paths).not.toContain("tsconfig.json");
        expect(paths).not.toContain("README.md");
        expect(paths).not.toContain("supabase/migrations/001_foundation.sql");
        expect(scaffold.securityBoundaries).toContain("PRIVATE_DOCUMENT_BUCKET");
        expect(scaffold.dependencyLock).toEqual({ manager: "NPM", path: "package-lock.json", required: true });
        expect(scaffold.files.find(file => file.path.endsWith("vertical-slice.ts"))?.content).toContain("verifyIdentity");
        const tokens = scaffold.files.find(file => file.path === "pbos/generated/design/tokens.ts")?.content;
        expect(tokens).toMatch(/\}\s+as const;\n$/);
        expect(tokens).not.toContain("}\n as const");
        const brandSource = scaffold.files.find(file => file.path === "pbos/generated/design/brand-source.json")?.content ?? "";
        expect(brandSource).toContain("BULLETPROOF-LOGO-CARD-001");
        expect(brandSource).toContain("Built to Leave a Legacy.");
    });

    it("materializes a reproducible new application with its dependency lock", async () => {
        const generator = new ApplicationScaffoldGenerator();
        const scaffold = generator.generate({ blueprint: { ...blueprint, application: { strategy: "CREATE_NEW" } }, includeFirstVerticalSlice: true });
        const calls: string[] = [];
        const result = await generator.materialize(scaffold, {
            writeFiles: async files => { calls.push(`files:${files.length}`); },
            prepareDependencyLock: async manager => { calls.push(`lock:${manager}`); }
        });
        expect(calls[0]).toMatch(/^files:/);
        expect(calls[1]).toBe("lock:NPM");
        expect(result.generatedPaths).toContain("package-lock.json");
        expect(result.generatedPaths).toContain("tsconfig.json");
        expect(result.generatedPaths).toContain("src/app/page.tsx");
    });

    it("prepares a reproducible dependency lock for an existing application", async () => {
        const generator = new ApplicationScaffoldGenerator();
        const scaffold = generator.generate({ blueprint, includeFirstVerticalSlice: true });
        const calls: string[] = [];
        const result = await generator.materialize(scaffold, {
            writeFiles: async () => { calls.push("files"); },
            prepareDependencyLock: async () => { calls.push("lock"); }
        });
        expect(calls).toEqual(["files", "lock"]);
        expect(result.generatedPaths).toContain("package-lock.json");
    });

    it("generates The Playbook education foundation without legacy-domain leakage", () => {
        const scaffold = new ApplicationScaffoldGenerator().generate({ blueprint: createPlaybookBlueprint(), includeFirstVerticalSlice: true });
        const paths = scaffold.files.map(file => file.path);
        expect(paths).toContain("pbos/generated/domain/education/scholar-journey.ts");
        expect(paths).not.toContain("src/domain/legacy/vertical-slice.ts");
        const migration = scaffold.files.find(file => file.path === "supabase/migrations/202608050002_pbos_scholar_foundation.sql")?.content ?? "";
        expect(migration).toContain("scholar_profiles");
        expect(migration).not.toContain("beneficiary_searches");
        expect(paths).not.toContain("src/app/page.tsx");
        expect(paths).not.toContain("package.json");
        expect(scaffold.securityBoundaries).not.toContain("PRIVATE_DOCUMENT_BUCKET");
    });

    it("materializes only the authorized capability package and its durable evidence marker", () => {
        const scaffold = new ApplicationScaffoldGenerator().generate({ blueprint: createPlaybookBlueprint(),
            includeFirstVerticalSlice: true, capabilities: ["ANALYTICS"] });
        const paths = scaffold.files.map(file => file.path);
        expect(paths).toContain("pbos/generated/capabilities/analytics.ts");
        expect(paths).toContain("pbos/generated/capabilities/analytics.test.ts");
        expect(paths).toContain("pbos/generated/capabilities/analytics.json");
        expect(paths).not.toContain("pbos/generated/capabilities/identity.json");
        expect(paths).not.toContain("pbos/generated/domain/education/scholar-journey.ts");
    });
});
