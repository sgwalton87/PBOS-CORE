import { ApplicationScaffoldGenerator } from "../application-scaffold";
import { RemediationPack, RemediationPackContext, RemediationPackResult } from "./remediation-pack";

abstract class ScaffoldPack implements RemediationPack {
    abstract readonly packId: string;
    abstract readonly category: RemediationPack["category"];
    readonly version = "1.0.0";
    constructor(private readonly signals: readonly string[], private readonly paths: (path: string) => boolean,
        private readonly scaffolds = new ApplicationScaffoldGenerator()) {}
    supports(context: RemediationPackContext): boolean { return this.signals.some(signal => context.failureText.includes(signal)); }
    async remediate(context: RemediationPackContext): Promise<RemediationPackResult> {
        const scaffold = this.scaffolds.generate({ blueprint: context.blueprint, includeFirstVerticalSlice: true });
        return { summary: `Apply ${this.packId}@${this.version}`, files: scaffold.files.filter(file => this.paths(file.path)) };
    }
}

export class NodeDependencyRemediationPack implements RemediationPack {
    readonly packId = "@pbos/remediation-node-dependencies";
    readonly version = "1.0.0";
    readonly category = "STACK" as const;
    supports(context: RemediationPackContext): boolean {
        return ["npm ci", "package-lock", "eresolve", "cannot find package"].some(signal => context.failureText.includes(signal));
    }
    async remediate(): Promise<RemediationPackResult> {
        return { summary: "Regenerate the governed npm dependency lock", files: [], prepareDependencyLock: true };
    }
}

export class NextJsRemediationPack extends ScaffoldPack {
    readonly packId = "@pbos/remediation-nextjs";
    readonly category = "STACK" as const;
    constructor() { super(["next build", "couldn't find any `pages` or `app` directory", "tsconfig", "module not found", "typecheck", "build"],
        path => ["package.json", "tsconfig.json", "next-env.d.ts", "next.config.mjs", "vitest.config.ts"].includes(path) || path.startsWith("src/app/") || path.startsWith("src/design/")); }
}

export class SupabaseRemediationPack extends ScaffoldPack {
    readonly packId = "@pbos/remediation-supabase";
    readonly category = "DATABASE" as const;
    constructor() { super(["supabase", "row level security", "rls", "migration"],
        path => path.startsWith("supabase/") || path.includes("/auth/") || path.includes("/security/")); }
}

export class LegacyPlanningRemediationPack extends ScaffoldPack {
    readonly packId = "@pbos/remediation-legacy-planning";
    readonly category = "DOMAIN" as const;
    constructor() { super(["beneficiary", "identity verification", "legacy policy", "secure document", "test"],
        path => path.startsWith("src/domain/legacy/") || path === "supabase/storage.sql"); }
}

export class EducationRemediationPack extends ScaffoldPack {
    readonly packId = "@pbos/remediation-education";
    readonly category = "DOMAIN" as const;
    constructor() { super(["scholar journey", "scholar onboarding", "identity approval", "data exchange approval", "pbos/generated/domain/education"],
        path => path.startsWith("pbos/generated/domain/education/") || path === "supabase/migrations/202608050002_pbos_scholar_foundation.sql"); }
}

/**
 * Repairs the historical Playbook PR that placed a Playwright specification
 * inside Vitest's discovery tree. New generators use the top-level
 * `acceptance/` boundary; this pack is intentionally scoped by the Playbook
 * project profile and the exact Playwright/Vitest diagnostic.
 */
export class PlaywrightAcceptanceIsolationRemediationPack implements RemediationPack {
    readonly packId = "@pbos/remediation-playwright-acceptance-isolation";
    readonly version = "1.1.0";
    readonly category = "QUALITY" as const;
    supports(context: RemediationPackContext): boolean {
        return context.failureText.includes("playwright test did not expect test() to be called here") &&
            context.failureText.includes("tests/acceptance/pbos-scholar.spec.ts");
    }
    async remediate(): Promise<RemediationPackResult> {
        return { summary: `Apply ${this.packId}@${this.version}`, files: [{ path: "vitest.config.ts", content:
`import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    exclude: [...configDefaults.exclude, "tests/acceptance/**"],
  },
});
` }], replacements: [
            { path: "pbos/connector/playbook-connector.ts", search: "PLAYBOOK-DOMAIN-SCHOLAR-REGISTRATION-001",
                replacement: "PLAYBOOK-SCHOLAR-REGISTRATION-001" },
            { path: "pbos/connector/playbook-system-manifest.ts", search: 'registrationId: `${domainId}-REGISTRATION-001`,',
                replacement: 'registrationId: domainId === "PLAYBOOK-DOMAIN-SCHOLAR"\n        ? "PLAYBOOK-SCHOLAR-REGISTRATION-001"\n        : `${domainId}-REGISTRATION-001`,' },
            { path: "lib/pbos/scholar-onboarding-service.ts",
                search: "  registerIdentity(userId: string): Promise<PlaybookIdentityMapping>;\n  publishOnboarding",
                replacement: "  registerIdentity(userId: string): Promise<PlaybookIdentityMapping>;\n  verifyReady(identity: PlaybookIdentityMapping, correlationId: string): Promise<readonly string[]>;\n  publishOnboarding" },
            { path: "lib/pbos/scholar-onboarding-service.ts",
                search: "    const identity = await this.runtime.registerIdentity(input.actorId);\n    const baseProvenance = [...authority.provenance, identity.pbosIdentity.provenance];",
                replacement: "    const identity = await this.runtime.registerIdentity(input.actorId);\n    const readinessProvenance = await this.runtime.verifyReady(identity, input.idempotencyKey + \"-health\");\n    const baseProvenance = [...authority.provenance, identity.pbosIdentity.provenance, ...readinessProvenance];" },
            { path: "app/api/pbos/scholar/onboarding/route.ts",
                search: "      registerIdentity: userId => connector.registerIdentity(userId, \"SCHOLAR\"),\n      async publishOnboarding",
                replacement: `      registerIdentity: userId => connector.registerIdentity(userId, "SCHOLAR"),
      async verifyReady(identity, correlationId) {
        const response = await connector.health(identity, "Verify the certified Scholar runtime before durable onboarding.");
        if (!response.success) throw new Error(response.error.message);
        if (response.correlationId !== "playbook-health-" + identity.externalIdentity.externalIdentityId) {
          throw new Error("PBOS Scholar health response correlation mismatch.");
        }
        return [...response.provenance, correlationId];
      },
      async publishOnboarding` },
            { path: "pbos/connector/signed-server-transport.ts",
                search: `      "x-pbos-timestamp": timestamp, "x-pbos-nonce": nonce, "x-pbos-signature": signature
    } });
    return await response.json() as PbosResponse<T>;`,
                replacement: `      "x-pbos-timestamp": timestamp, "x-pbos-nonce": nonce, "x-pbos-signature": signature
    }, signal: AbortSignal.timeout(15_000) });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("application/json")) {
      throw new Error("PBOS v1 transport rejected the signed request with HTTP " + response.status + ".");
    }
    const result = await response.json() as PbosResponse<T>;
    if (result.correlationId !== request.correlationId) throw new Error("PBOS v1 response correlation mismatch.");
    return result;` },
            { path: "tests/unit/pbos/scholar-onboarding-service.test.ts",
                search: "      publishOnboarding: async () => [\"pbos:onboarding\"], projectDashboard: async () => [\"pbos:dashboard\"]",
                replacement: "      verifyReady: async () => [\"pbos:health\"], publishOnboarding: async () => [\"pbos:onboarding\"], projectDashboard: async () => [\"pbos:dashboard\"]" },
            { path: "tests/unit/pbos/scholar-onboarding-service.test.ts",
                search: "expect.arrayContaining([\"identity-approval\", \"pbos:onboarding\"",
                replacement: "expect.arrayContaining([\"identity-approval\", \"pbos:health\", \"pbos:onboarding\"" },
            { path: "tests/unit/pbos/scholar-onboarding-service.test.ts",
                search: "const runtime = { registerIdentity: async () => { throw new Error(\"must not register\"); }, publishOnboarding:",
                replacement: "const runtime = { registerIdentity: async () => { throw new Error(\"must not register\"); }, verifyReady: async () => [], publishOnboarding:" }
        ] };
    }
}
