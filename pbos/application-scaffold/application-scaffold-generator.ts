import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import { resolve, sep } from "path";
import { promisify } from "util";
import { ApplicationScaffold, MaterializedScaffold, ScaffoldFile, ScaffoldMaterializationTarget, ScaffoldRequest } from "./contracts";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export class ApplicationScaffoldGenerator {
    generate(request: ScaffoldRequest): ApplicationScaffold {
        const { blueprint } = request;
        if (blueprint.status !== "READY_FOR_APPROVAL") throw new Error("Application scaffolding requires an approval-ready blueprint.");
        const selectedCapabilities = [...new Set(request.capabilities ?? blueprint.capabilities)];
        if (selectedCapabilities.some(capability => !blueprint.capabilities.includes(capability))) {
            throw new Error("Scaffold capability scope must be declared by the system blueprint.");
        }
        const connected = blueprint.application.strategy === "CONNECT_EXISTING";
        const files: ScaffoldFile[] = connected ? this.existingApplicationOverlay(blueprint) : [
            { path: "package.json", content: json({ name: blueprint.identity.proposedSystemId.toLowerCase(), version: "0.1.0", private: true,
                scripts: { dev: "next dev", build: "next build", typecheck: "tsc --noEmit", test: "vitest run" },
                dependencies: { "@supabase/ssr": "latest", "@supabase/supabase-js": "latest", next: "latest", react: "latest", "react-dom": "latest", zod: "latest" },
                devDependencies: { "@types/node": "latest", "@types/react": "latest", typescript: "latest", vitest: "latest" } }) },
            { path: "tsconfig.json", content: json({ compilerOptions: { target: "ES2022", lib: ["dom", "dom.iterable", "ES2022"],
                allowJs: false, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: "esnext",
                moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "preserve", incremental: true,
                plugins: [{ name: "next" }], paths: { "@/*": ["./src/*"] } }, include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"], exclude: ["node_modules"] }) },
            { path: "next-env.d.ts", content: "/// <reference types=\"next\" />\n/// <reference types=\"next/image-types/global\" />\n" },
            { path: "next.config.mjs", content: "/** @type {import('next').NextConfig} */\nconst nextConfig = { reactStrictMode: true };\nexport default nextConfig;\n" },
            { path: "src/app/layout.tsx", content: "import type { ReactNode } from \"react\";\nimport \"./styles.css\";\nexport default function RootLayout({ children }: { children: ReactNode }) { return <html lang=\"en\"><body>{children}</body></html>; }\n" },
            { path: "src/app/page.tsx", content: `import { designTokens } from "@/design/tokens";\nexport default function Home() { return <main><p className="eyebrow">PBOS v1 · ${this.domainLabel(blueprint.foundation.domainPack)}</p><h1>${blueprint.identity.systemName}</h1><p>${blueprint.mission}</p><a href="#start" style={{ background: designTokens.colors.primary }}>Begin your journey</a></main>; }\n` },
            { path: "src/app/styles.css", content: ":root { color-scheme: light dark; font-family: Inter, system-ui, sans-serif; } body { margin: 0; background: #f7f9fc; color: #111827; } main { max-width: 720px; margin: 12vh auto; padding: 3rem; } h1 { font-size: clamp(2.5rem, 7vw, 5rem); line-height: 1; } a { display: inline-block; margin-top: 1rem; padding: .85rem 1.2rem; border-radius: 14px; color: white; text-decoration: none; } .eyebrow { letter-spacing: .12em; text-transform: uppercase; }\n" },
            { path: "vitest.config.ts", content: "import { defineConfig } from \"vitest/config\";\nexport default defineConfig({ test: { environment: \"node\" } });\n" },
            { path: "PBOS.yaml", content: `systemId: ${blueprint.identity.proposedSystemId}\noperatingSystemId: ${blueprint.identity.proposedOperatingSystemId}\npbosVersion: ${blueprint.foundation.pbosVersion}\ndomainPack: ${blueprint.foundation.domainPack}\nblueprintId: ${blueprint.blueprintId}\n` },
            { path: "src/design/tokens.ts", content: `export const designTokens = ${json(blueprint.design.tokens).trimEnd()} as const;\n` },
            { path: "src/design/brand-source.json", content: json({
                sourceBlueprintId: blueprint.blueprintId,
                systemId: blueprint.identity.proposedSystemId,
                tagline: blueprint.design.brand.tagline,
                typography: blueprint.design.tokens.typography,
                usageGuidance: blueprint.design.brand.usageGuidance,
                assets: blueprint.design.brand.assets ?? [],
                policy: "References are build inputs. Verify integrity, rights, and production-ready variants before copying or publishing assets."
            }) },
            { path: "src/lib/auth/server.ts", content: "export interface AuthenticatedActor { actorId: string; organizationId: string; roles: readonly string[] }\nexport function requireActor(actor?: AuthenticatedActor): AuthenticatedActor { if (!actor) throw new Error(\"Authentication required.\"); return actor; }\n" },
            { path: "src/lib/security/authority.ts", content: "export function requireOwner(actorId: string, ownerId: string): void { if (actorId !== ownerId) throw new Error(\"Access denied.\"); }\nexport function requireApproval(approvalId?: string): string { if (!approvalId) throw new Error(\"Explicit approval required.\"); return approvalId; }\n" },
            { path: "supabase/migrations/001_foundation.sql", content: this.foundationSql(blueprint.foundation.domainPack) },
            { path: ".github/workflows/ci.yml", content: "name: CI\non: [pull_request]\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - run: npm ci\n      - run: npm run typecheck\n      - run: npm test\n      - run: npm run build\n" },
            { path: ".env.example", content: "NEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_ANON_KEY=\nSUPABASE_SERVICE_ROLE_KEY=\nPBOS_API_URL=\nPBOS_CONNECTOR_ID=\n" },
            { path: "README.md", content: `# ${blueprint.identity.systemName}\n\nGenerated from PBOS blueprint \`${blueprint.blueprintId}\`. Validation, certification, and deployment remain human-controlled gates.\n` }
        ];
        files.push(...selectedCapabilities.flatMap(capability => this.capabilityFoundation(blueprint, capability)));
        const includesJourney = selectedCapabilities.some(capability => capability === "IDENTITY" || capability === "WORKFLOWS");
        if (request.includeFirstVerticalSlice && includesJourney && blueprint.foundation.domainPack === "@pbos/domain-legacy-planning") files.push(...this.legacySlice(connected));
        if (request.includeFirstVerticalSlice && includesJourney && blueprint.foundation.domainPack === "@pbos/domain-education") files.push(...this.educationSlice(connected));
        return { scaffoldId: randomUUID(), blueprintId: blueprint.blueprintId,
            stack: { framework: "NEXTJS", language: "TYPESCRIPT", database: "SUPABASE_POSTGRES", authentication: "SUPABASE_AUTH", deployment: "VERCEL" },
            mode: connected ? "EXISTING_APPLICATION_OVERLAY" : "NEW_APPLICATION",
            files, securityBoundaries: this.securityBoundaries(blueprint.foundation.domainPack),
            // Existing applications must be reproducible too. The lock is prepared as part
            // of the governed change so `npm ci` never depends on an operator's workspace.
            dependencyLock: { manager: "NPM", path: "package-lock.json", required: true }, generatedAt: new Date() };
    }

    async materialize(scaffold: ApplicationScaffold, target: ScaffoldMaterializationTarget): Promise<MaterializedScaffold> {
        await target.writeFiles(scaffold.files);
        if (scaffold.dependencyLock.required) await target.prepareDependencyLock(scaffold.dependencyLock.manager);
        return { scaffoldId: scaffold.scaffoldId,
            generatedPaths: [...new Set([...scaffold.files.map(file => file.path), ...(scaffold.dependencyLock.required ? [scaffold.dependencyLock.path] : [])])] };
    }

    async write(scaffold: ApplicationScaffold, targetRoot: string): Promise<void> {
        const root = resolve(targetRoot);
        for (const file of scaffold.files) {
            const target = resolve(root, file.path);
            if (!target.startsWith(`${root}${sep}`)) throw new Error(`Scaffold path escapes target: ${file.path}`);
            await mkdir(resolve(target, ".."), { recursive: true });
            await writeFile(target, file.content, { encoding: "utf8", flag: "wx" });
        }
        if (scaffold.dependencyLock.required) {
            await promisify(execFile)("npm", ["install", "--package-lock-only", "--ignore-scripts"], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
        }
    }

    private foundationSql(domainPack: string): string {
        if (domainPack === "@pbos/domain-education") return this.educationFoundationSql();
        return `create extension if not exists pgcrypto;\n\ncreate table profiles (id uuid primary key references auth.users(id), display_name text not null, identity_status text not null default 'PENDING', created_at timestamptz not null default now());\ncreate table beneficiary_searches (id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles(id), beneficiary_name text not null, relationship text not null, status text not null default 'DRAFT', provenance jsonb not null default '[]', created_at timestamptz not null default now());\ncreate table legacy_policy_records (id uuid primary key default gen_random_uuid(), search_id uuid not null references beneficiary_searches(id), owner_id uuid not null references profiles(id), carrier text, policy_reference text, status text not null, provenance jsonb not null default '[]');\ncreate table secure_documents (id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles(id), policy_id uuid references legacy_policy_records(id), storage_key text not null unique, classification text not null, sha256 text not null, created_at timestamptz not null default now());\n\nalter table profiles enable row level security;\nalter table beneficiary_searches enable row level security;\nalter table legacy_policy_records enable row level security;\nalter table secure_documents enable row level security;\ncreate policy \"profiles-own\" on profiles using (auth.uid() = id);\ncreate policy \"searches-own\" on beneficiary_searches using (auth.uid() = owner_id) with check (auth.uid() = owner_id);\ncreate policy \"policies-own\" on legacy_policy_records using (auth.uid() = owner_id) with check (auth.uid() = owner_id);\ncreate policy \"documents-own\" on secure_documents using (auth.uid() = owner_id) with check (auth.uid() = owner_id);\n`;
    }

    private capabilityFoundation(blueprint: ScaffoldRequest["blueprint"], capability: ScaffoldRequest["blueprint"]["capabilities"][number]): ScaffoldFile[] {
        const slug = capability.toLowerCase().replaceAll("_", "-");
        const symbol = capability.toLowerCase().split("_").map(part => `${part[0].toUpperCase()}${part.slice(1)}`).join("");
        return [
            { path: `pbos/generated/capabilities/${slug}.ts`, content: `export interface ${symbol}Execution { actorId: string; approvalId: string; provenance: readonly string[] }\nexport function execute${symbol}(input: ${symbol}Execution): ${symbol}Execution {\n  if (!input.actorId) throw new Error("Authenticated actor required.");\n  if (!input.approvalId) throw new Error("Governed approval required.");\n  if (input.provenance.length === 0) throw new Error("Evidence provenance required.");\n  return { ...input, provenance: [...input.provenance, input.approvalId] };\n}\n` },
            { path: `pbos/generated/capabilities/${slug}.test.ts`, content: `import { describe, expect, it } from "vitest";\nimport { execute${symbol} } from "./${slug}";\ndescribe("${capability} governed capability", () => { it("requires authority and provenance", () => { expect(() => execute${symbol}({ actorId: "actor", approvalId: "", provenance: ["source"] })).toThrow("approval"); expect(execute${symbol}({ actorId: "actor", approvalId: "approval", provenance: ["source"] }).provenance).toContain("approval"); }); });\n` },
            { path: `pbos/generated/capabilities/${slug}.json`, content: json({ systemId: blueprint.identity.proposedSystemId,
                capability, blueprintId: blueprint.blueprintId, state: "IMPLEMENTED_PENDING_CERTIFICATION",
                implementation: `pbos/generated/capabilities/${slug}.ts`, validation: `pbos/generated/capabilities/${slug}.test.ts` }) }
        ];
    }

    private existingApplicationOverlay(blueprint: ScaffoldRequest["blueprint"]): ScaffoldFile[] {
        return [
            { path: "PBOS.yaml", content: `systemId: ${blueprint.identity.proposedSystemId}\noperatingSystemId: ${blueprint.identity.proposedOperatingSystemId}\npbosVersion: ${blueprint.foundation.pbosVersion}\ndomainPack: ${blueprint.foundation.domainPack}\nblueprintId: ${blueprint.blueprintId}\n` },
            { path: "pbos/generated/design/tokens.ts", content: `export const designTokens = ${json(blueprint.design.tokens).trimEnd()} as const;\n` },
            { path: "pbos/generated/design/brand-source.json", content: json({
                sourceBlueprintId: blueprint.blueprintId, systemId: blueprint.identity.proposedSystemId,
                tagline: blueprint.design.brand.tagline, typography: blueprint.design.tokens.typography,
                usageGuidance: blueprint.design.brand.usageGuidance, assets: blueprint.design.brand.assets ?? [],
                policy: "References are build inputs. Verify integrity, rights, and production-ready variants before copying or publishing assets."
            }) },
            { path: "pbos/generated/security/authority.ts", content: "export function requireOwner(actorId: string, ownerId: string): void { if (actorId !== ownerId) throw new Error(\"Access denied.\"); }\nexport function requireApproval(approvalId?: string): string { if (!approvalId) throw new Error(\"Explicit approval required.\"); return approvalId; }\n" },
            { path: "pbos/generated/README.md", content: `# PBOS generated overlay\n\nGenerated for ${blueprint.identity.systemName} from blueprint \`${blueprint.blueprintId}\`. Existing application manifests, dependency locks, compiler configuration, routes, workflows, and documentation are intentionally preserved.\n` }
        ];
    }

    private educationFoundationSql(): string {
        return `create extension if not exists pgcrypto;\n\ncreate table scholar_profiles (id uuid primary key references auth.users(id), display_name text not null, role text not null default 'SCHOLAR', onboarding_status text not null default 'STARTED', created_at timestamptz not null default now());\ncreate table scholar_goals (id uuid primary key default gen_random_uuid(), scholar_id uuid not null references scholar_profiles(id), title text not null, status text not null default 'ACTIVE', provenance jsonb not null default '[]', created_at timestamptz not null default now());\ncreate table scholar_milestones (id uuid primary key default gen_random_uuid(), scholar_id uuid not null references scholar_profiles(id), goal_id uuid references scholar_goals(id), milestone_type text not null, approval_id text, provenance jsonb not null default '[]', occurred_at timestamptz not null default now());\n\nalter table scholar_profiles enable row level security;\nalter table scholar_goals enable row level security;\nalter table scholar_milestones enable row level security;\ncreate policy "scholar-profile-own" on scholar_profiles using (auth.uid() = id) with check (auth.uid() = id);\ncreate policy "scholar-goals-own" on scholar_goals using (auth.uid() = scholar_id) with check (auth.uid() = scholar_id);\ncreate policy "scholar-milestones-own" on scholar_milestones using (auth.uid() = scholar_id) with check (auth.uid() = scholar_id);\n`;
    }

    private domainLabel(domainPack: string): string {
        if (domainPack === "@pbos/domain-education") return "Education";
        if (domainPack === "@pbos/domain-legacy-planning") return "Legacy Planning";
        return "Connected System";
    }

    private securityBoundaries(domainPack: string): string[] {
        const shared = ["ROW_LEVEL_SECURITY", "SIGNED_PBOS_IDENTITY", "OWNER_SCOPED_RECORDS", "AUDIT_PROVENANCE", "NO_CLIENT_SERVICE_ROLE_KEY"];
        return domainPack === "@pbos/domain-legacy-planning" ? [...shared, "PRIVATE_DOCUMENT_BUCKET"] : shared;
    }

    private legacySlice(connected = false): ScaffoldFile[] {
        const root = connected ? "pbos/generated/domain/legacy" : "src/domain/legacy";
        return [
            { path: `${root}/vertical-slice.ts`, content: `import { randomUUID, createHash } from "crypto";\nexport type SearchStatus = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "MATCH_FOUND" | "NO_MATCH" | "CLOSED";\nexport interface Account { id: string; email: string; identityStatus: "PENDING" | "VERIFIED" }\nexport interface Search { id: string; ownerId: string; beneficiaryName: string; status: SearchStatus; provenance: string[] }\nexport interface Policy { id: string; searchId: string; ownerId: string; policyReference: string; provenance: string[] }\nexport interface SecureDocument { id: string; ownerId: string; policyId: string; storageKey: string; sha256: string; classification: "CONFIDENTIAL" }\nexport class BulletproofVerticalSlice {\n  createAccount(email: string): Account { if (!email.includes("@")) throw new Error("Valid email required."); return { id: randomUUID(), email, identityStatus: "PENDING" }; }\n  verifyIdentity(account: Account, approvalId?: string): Account { if (!approvalId) throw new Error("Identity verification approval required."); return { ...account, identityStatus: "VERIFIED" }; }\n  requestSearch(account: Account, beneficiaryName: string): Search { if (account.identityStatus !== "VERIFIED") throw new Error("Verified identity required."); return { id: randomUUID(), ownerId: account.id, beneficiaryName, status: "SUBMITTED", provenance: [account.id] }; }\n  trackSearch(search: Search, actorId: string): Search { if (search.ownerId !== actorId) throw new Error("Access denied."); return search; }\n  recordPolicy(search: Search, policyReference: string, approvalId?: string): Policy { if (!approvalId || search.status !== "MATCH_FOUND") throw new Error("Approved match required."); return { id: randomUUID(), searchId: search.id, ownerId: search.ownerId, policyReference, provenance: [...search.provenance, approvalId] }; }\n  secureDocument(policy: Policy, bytes: Uint8Array): SecureDocument { const sha256 = createHash("sha256").update(bytes).digest("hex"); return { id: randomUUID(), ownerId: policy.ownerId, policyId: policy.id, storageKey: policy.ownerId + "/" + randomUUID(), sha256, classification: "CONFIDENTIAL" }; }\n}\n` },
            { path: `${root}/vertical-slice.test.ts`, content: `import { describe, expect, it } from "vitest";\nimport { BulletproofVerticalSlice } from "./vertical-slice";\ndescribe("Bulletproof first vertical slice", () => { it("requires verified identity before search", () => { const service = new BulletproofVerticalSlice(); const account = service.createAccount("member@example.com"); expect(() => service.requestSearch(account, "Beneficiary")).toThrow("Verified identity"); }); });\n` },
            { path: connected ? "supabase/migrations/202608050001_pbos_secure_documents.sql" : "supabase/storage.sql", content: "insert into storage.buckets (id, name, public) values ('secure-documents', 'secure-documents', false);\ncreate policy \"document-owner-read\" on storage.objects for select using (bucket_id = 'secure-documents' and auth.uid()::text = (storage.foldername(name))[1]);\n" }
        ];
    }

    private educationSlice(connected = false): ScaffoldFile[] {
        const root = connected ? "pbos/generated/domain/education" : "src/domain/education";
        return [
            { path: `${root}/scholar-journey.ts`, content: `import { randomUUID } from "crypto";\nexport type OnboardingStatus = "STARTED" | "IDENTITY_VERIFIED" | "GOALS_CAPTURED" | "DASHBOARD_READY";\nexport interface Scholar { id: string; email: string; status: OnboardingStatus; provenance: string[] }\nexport interface ScholarGoal { id: string; scholarId: string; title: string; status: "ACTIVE"; provenance: string[] }\nexport interface ScholarDashboard { scholarId: string; goalIds: string[]; generatedFrom: string[] }\nexport class ScholarJourney {\n  begin(email: string): Scholar { if (!email.includes("@")) throw new Error("Valid email required."); return { id: randomUUID(), email, status: "STARTED", provenance: [] }; }\n  verifyIdentity(scholar: Scholar, approvalId?: string): Scholar { if (!approvalId) throw new Error("Identity approval required."); return { ...scholar, status: "IDENTITY_VERIFIED", provenance: [...scholar.provenance, approvalId] }; }\n  captureGoal(scholar: Scholar, title: string): ScholarGoal { if (scholar.status !== "IDENTITY_VERIFIED") throw new Error("Verified identity required."); if (!title.trim()) throw new Error("Goal title required."); return { id: randomUUID(), scholarId: scholar.id, title, status: "ACTIVE", provenance: [...scholar.provenance, scholar.id] }; }\n  projectDashboard(scholar: Scholar, goals: ScholarGoal[], exchangeApprovalId?: string): ScholarDashboard { if (!exchangeApprovalId) throw new Error("PBOS data exchange approval required."); if (goals.some(goal => goal.scholarId !== scholar.id)) throw new Error("Cross-scholar projection denied."); return { scholarId: scholar.id, goalIds: goals.map(goal => goal.id), generatedFrom: [...scholar.provenance, exchangeApprovalId] }; }\n}\n` },
            { path: `${root}/scholar-journey.test.ts`, content: `import { describe, expect, it } from "vitest";\nimport { ScholarJourney } from "./scholar-journey";\ndescribe("The Playbook Scholar onboarding-to-dashboard slice", () => { it("requires governed identity and exchange approval", () => { const service = new ScholarJourney(); const scholar = service.begin("scholar@example.com"); expect(() => service.captureGoal(scholar, "Graduate")).toThrow("Verified identity"); const verified = service.verifyIdentity(scholar, "IDENTITY-APPROVAL-001"); const goal = service.captureGoal(verified, "Graduate"); expect(() => service.projectDashboard(verified, [goal])).toThrow("exchange approval"); expect(service.projectDashboard(verified, [goal], "EXCHANGE-APPROVAL-001").goalIds).toEqual([goal.id]); }); });\n` },
            ...(connected ? [{ path: "supabase/migrations/202608050002_pbos_scholar_foundation.sql", content: this.educationFoundationSql() }] : [])
        ];
    }
}
