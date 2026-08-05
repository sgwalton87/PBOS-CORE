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
