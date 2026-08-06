import { describe, expect, it } from "vitest";
import { createBulletproofBlueprint, createPlaybookBlueprint } from "../../reference-systems";
import { ApplicationScaffoldGenerator } from "../index";

const bulletproof = createBulletproofBlueprint();
const blueprint = { ...bulletproof, design: { ...bulletproof.design,
    brand: { ...bulletproof.design.brand,
        personalities: ["TRUSTWORTHY"] as const, visualDirection: "EXISTING_BRAND" as const,
        tagline: "Built to Leave a Legacy.", headingFont: "Inter", bodyFont: "Inter",
        assets: [{ assetId: "BULLETPROOF-LOGO-CARD-001", kind: "LOGO_CARD" as const,
            location: "brand/bulletproof-logo-card.png", rightsConfirmed: true }] } } };

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
        expect(scaffold.platformCapabilities).toEqual(["PBOS_ENGINEERING_MEMORY"]);
        expect(paths).toContain(".pbos/archivist.json");
        expect(paths).toContain(".githooks/pbos-archivist-post-commit");
        expect(paths).toContain(".github/workflows/pbos-engineering-memory.yml");
        expect(scaffold.files.find(file => file.path === ".githooks/pbos-archivist-post-commit")?.executable).toBe(true);
        expect(paths).not.toContain("docs/project-management/milestones/index.md");
        const archivist = scaffold.files.find(file => file.path === ".pbos/archivist.json")?.content ?? "";
        expect(archivist).toContain("BULLETPROOF-SYSTEM-001");
        expect(archivist).toContain("vycoywalton/bulletproof-beneficiary-registry");
        expect(scaffold.files.find(file => file.path === "PBOS.yaml")?.content).toContain("PBOS_ENGINEERING_MEMORY");
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
        expect(result.generatedPaths).toContain("docs/project-management/milestones/index.md");
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
        expect(migration).toContain("create table if not exists scholar_profiles");
        expect(migration).toContain('drop policy if exists "scholar-profile-own"');
        expect(migration).not.toContain("beneficiary_searches");
        expect(paths).not.toContain("src/app/page.tsx");
        expect(paths).not.toContain("package.json");
        expect(scaffold.securityBoundaries).not.toContain("PRIVATE_DOCUMENT_BUCKET");
        expect(paths).toContain("scripts/pbos-archive-milestone.mjs");
        expect(paths).toContain("scripts/pbos-install-archivist.mjs");
        const archivist = scaffold.files.find(file => file.path === ".pbos/archivist.json")?.content ?? "";
        expect(archivist).toContain("PLAYBOOK-SYSTEM-001");
        expect(archivist).not.toContain("BULLETPROOF-SYSTEM-001");
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
