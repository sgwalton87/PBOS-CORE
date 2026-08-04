import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { resolve, sep } from "path";
import { ApplicationScaffold, ScaffoldFile, ScaffoldRequest } from "./contracts";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export class ApplicationScaffoldGenerator {
    generate(request: ScaffoldRequest): ApplicationScaffold {
        const { blueprint } = request;
        if (blueprint.status !== "READY_FOR_APPROVAL") throw new Error("Application scaffolding requires an approval-ready blueprint.");
        const files: ScaffoldFile[] = [
            { path: "package.json", content: json({ name: blueprint.identity.proposedSystemId.toLowerCase(), version: "0.1.0", private: true,
                scripts: { dev: "next dev", build: "next build", typecheck: "tsc --noEmit", test: "vitest run" },
                dependencies: { "@supabase/ssr": "latest", "@supabase/supabase-js": "latest", next: "latest", react: "latest", "react-dom": "latest", zod: "latest" },
                devDependencies: { "@types/node": "latest", "@types/react": "latest", typescript: "latest", vitest: "latest" } }) },
            { path: "PBOS.yaml", content: `systemId: ${blueprint.identity.proposedSystemId}\noperatingSystemId: ${blueprint.identity.proposedOperatingSystemId}\npbosVersion: ${blueprint.foundation.pbosVersion}\ndomainPack: ${blueprint.foundation.domainPack}\nblueprintId: ${blueprint.blueprintId}\n` },
            { path: "src/design/tokens.ts", content: `export const designTokens = ${json(blueprint.design.tokens)} as const;\n` },
            { path: "src/lib/auth/server.ts", content: "export interface AuthenticatedActor { actorId: string; organizationId: string; roles: readonly string[] }\nexport function requireActor(actor?: AuthenticatedActor): AuthenticatedActor { if (!actor) throw new Error(\"Authentication required.\"); return actor; }\n" },
            { path: "src/lib/security/authority.ts", content: "export function requireOwner(actorId: string, ownerId: string): void { if (actorId !== ownerId) throw new Error(\"Access denied.\"); }\nexport function requireApproval(approvalId?: string): string { if (!approvalId) throw new Error(\"Explicit approval required.\"); return approvalId; }\n" },
            { path: "supabase/migrations/001_foundation.sql", content: this.foundationSql() },
            { path: ".github/workflows/ci.yml", content: "name: CI\non: [pull_request]\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - run: npm ci\n      - run: npm run typecheck\n      - run: npm test\n      - run: npm run build\n" },
            { path: ".env.example", content: "NEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_ANON_KEY=\nSUPABASE_SERVICE_ROLE_KEY=\nPBOS_API_URL=\nPBOS_CONNECTOR_ID=\n" },
            { path: "README.md", content: `# ${blueprint.identity.systemName}\n\nGenerated from PBOS blueprint \`${blueprint.blueprintId}\`. Validation, certification, and deployment remain human-controlled gates.\n` }
        ];
        if (request.includeFirstVerticalSlice && blueprint.foundation.domainPack === "@pbos/domain-legacy-planning") files.push(...this.legacySlice());
        return { scaffoldId: randomUUID(), blueprintId: blueprint.blueprintId,
            stack: { framework: "NEXTJS", language: "TYPESCRIPT", database: "SUPABASE_POSTGRES", authentication: "SUPABASE_AUTH", deployment: "VERCEL" },
            files, securityBoundaries: ["ROW_LEVEL_SECURITY", "SIGNED_PBOS_IDENTITY", "OWNER_SCOPED_RECORDS", "PRIVATE_DOCUMENT_BUCKET", "AUDIT_PROVENANCE", "NO_CLIENT_SERVICE_ROLE_KEY"], generatedAt: new Date() };
    }

    async write(scaffold: ApplicationScaffold, targetRoot: string): Promise<void> {
        const root = resolve(targetRoot);
        for (const file of scaffold.files) {
            const target = resolve(root, file.path);
            if (!target.startsWith(`${root}${sep}`)) throw new Error(`Scaffold path escapes target: ${file.path}`);
            await mkdir(resolve(target, ".."), { recursive: true });
            await writeFile(target, file.content, { encoding: "utf8", flag: "wx" });
        }
    }

    private foundationSql(): string {
        return `create extension if not exists pgcrypto;\n\ncreate table profiles (id uuid primary key references auth.users(id), display_name text not null, identity_status text not null default 'PENDING', created_at timestamptz not null default now());\ncreate table beneficiary_searches (id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles(id), beneficiary_name text not null, relationship text not null, status text not null default 'DRAFT', provenance jsonb not null default '[]', created_at timestamptz not null default now());\ncreate table legacy_policy_records (id uuid primary key default gen_random_uuid(), search_id uuid not null references beneficiary_searches(id), owner_id uuid not null references profiles(id), carrier text, policy_reference text, status text not null, provenance jsonb not null default '[]');\ncreate table secure_documents (id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles(id), policy_id uuid references legacy_policy_records(id), storage_key text not null unique, classification text not null, sha256 text not null, created_at timestamptz not null default now());\n\nalter table profiles enable row level security;\nalter table beneficiary_searches enable row level security;\nalter table legacy_policy_records enable row level security;\nalter table secure_documents enable row level security;\ncreate policy \"profiles-own\" on profiles using (auth.uid() = id);\ncreate policy \"searches-own\" on beneficiary_searches using (auth.uid() = owner_id) with check (auth.uid() = owner_id);\ncreate policy \"policies-own\" on legacy_policy_records using (auth.uid() = owner_id) with check (auth.uid() = owner_id);\ncreate policy \"documents-own\" on secure_documents using (auth.uid() = owner_id) with check (auth.uid() = owner_id);\n`;
    }

    private legacySlice(): ScaffoldFile[] {
        return [
            { path: "src/domain/legacy/vertical-slice.ts", content: `import { randomUUID, createHash } from "crypto";\nexport type SearchStatus = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "MATCH_FOUND" | "NO_MATCH" | "CLOSED";\nexport interface Account { id: string; email: string; identityStatus: "PENDING" | "VERIFIED" }\nexport interface Search { id: string; ownerId: string; beneficiaryName: string; status: SearchStatus; provenance: string[] }\nexport interface Policy { id: string; searchId: string; ownerId: string; policyReference: string; provenance: string[] }\nexport interface SecureDocument { id: string; ownerId: string; policyId: string; storageKey: string; sha256: string; classification: "CONFIDENTIAL" }\nexport class BulletproofVerticalSlice {\n  createAccount(email: string): Account { if (!email.includes("@")) throw new Error("Valid email required."); return { id: randomUUID(), email, identityStatus: "PENDING" }; }\n  verifyIdentity(account: Account, approvalId?: string): Account { if (!approvalId) throw new Error("Identity verification approval required."); return { ...account, identityStatus: "VERIFIED" }; }\n  requestSearch(account: Account, beneficiaryName: string): Search { if (account.identityStatus !== "VERIFIED") throw new Error("Verified identity required."); return { id: randomUUID(), ownerId: account.id, beneficiaryName, status: "SUBMITTED", provenance: [account.id] }; }\n  trackSearch(search: Search, actorId: string): Search { if (search.ownerId !== actorId) throw new Error("Access denied."); return search; }\n  recordPolicy(search: Search, policyReference: string, approvalId?: string): Policy { if (!approvalId || search.status !== "MATCH_FOUND") throw new Error("Approved match required."); return { id: randomUUID(), searchId: search.id, ownerId: search.ownerId, policyReference, provenance: [...search.provenance, approvalId] }; }\n  secureDocument(policy: Policy, bytes: Uint8Array): SecureDocument { const sha256 = createHash("sha256").update(bytes).digest("hex"); return { id: randomUUID(), ownerId: policy.ownerId, policyId: policy.id, storageKey: policy.ownerId + "/" + randomUUID(), sha256, classification: "CONFIDENTIAL" }; }\n}\n` },
            { path: "src/domain/legacy/vertical-slice.test.ts", content: `import { describe, expect, it } from "vitest";\nimport { BulletproofVerticalSlice } from "./vertical-slice";\ndescribe("Bulletproof first vertical slice", () => { it("requires verified identity before search", () => { const service = new BulletproofVerticalSlice(); const account = service.createAccount("member@example.com"); expect(() => service.requestSearch(account, "Beneficiary")).toThrow("Verified identity"); }); });\n` },
            { path: "supabase/storage.sql", content: "insert into storage.buckets (id, name, public) values ('secure-documents', 'secure-documents', false);\ncreate policy \"document-owner-read\" on storage.objects for select using (bucket_id = 'secure-documents' and auth.uid()::text = (storage.foldername(name))[1]);\n" }
        ];
    }
}
