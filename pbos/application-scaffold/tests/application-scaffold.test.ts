import { describe, expect, it } from "vitest";
import { SystemBlueprintFactory } from "../../system-blueprint";
import { ApplicationScaffoldGenerator } from "../index";

const blueprint = new SystemBlueprintFactory().create({ organizationName: "Bulletproof", systemName: "Bulletproof Beneficiary", mission: "Protect family legacy.",
    users: ["Members"], desiredOutcomes: ["Policy discovery"], domain: "LEGACY_PLANNING", capabilities: ["IDENTITY", "WORKFLOWS", "DOCUMENTS"],
    applicationStrategy: "CONNECT_EXISTING", existingRepository: "vycoywalton/bulletproof-beneficiary-registry", autonomyMode: "HUMAN_GATED",
    businessOwner: "Viveca", technicalOwner: "PBOS", operatingRegions: ["US"], dataClassifications: ["BENEFICIARY_DATA"], regulatoryFrameworks: ["HUMAN_REVIEW"],
    brand: { personalities: ["TRUSTWORTHY"], visualDirection: "PBOS_RECOMMENDED", theme: "BOTH", cornerStyle: "ROUNDED", density: "COMFORTABLE" } });

describe("application scaffold generator", () => {
    it("generates stack, security, CI, deployment, and Bulletproof vertical slice", () => {
        const scaffold = new ApplicationScaffoldGenerator().generate({ blueprint, includeFirstVerticalSlice: true });
        const paths = scaffold.files.map(file => file.path);
        expect(paths).toContain("supabase/migrations/001_foundation.sql");
        expect(paths).toContain(".github/workflows/ci.yml");
        expect(paths).toContain("src/domain/legacy/vertical-slice.ts");
        expect(scaffold.securityBoundaries).toContain("PRIVATE_DOCUMENT_BUCKET");
        expect(scaffold.files.find(file => file.path.endsWith("vertical-slice.ts"))?.content).toContain("verifyIdentity");
    });
});
