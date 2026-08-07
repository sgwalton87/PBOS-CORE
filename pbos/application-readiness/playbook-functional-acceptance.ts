import { GitHubRepositoryGateway, RepositoryFileChange, RepositoryReference } from "../platform";
import { FunctionalAcceptancePlan, ProtectedEnvironmentReadiness, ProtectedEnvironmentResolver } from "../production-runtime";
import { homedir } from "os";
import { join } from "path";
import { PLAYBOOK_SCHOLAR_STAGING_TABLES } from "./playbook-staging-migration";

export const PLAYBOOK_SCHOLAR_ACCEPTANCE_ENVIRONMENT = [
    "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "PBOS_API_URL", "PBOS_ORGANIZATION_ID", "PBOS_CONNECTOR_ID", "PBOS_CONNECTOR_KEY_ID",
    "PBOS_CONNECTOR_SECRET_BASE64", "PBOS_SCHOLAR_IDENTITY_APPROVAL_ID", "PBOS_SCHOLAR_EXCHANGE_APPROVAL_ID",
    "PBOS_ACCEPTANCE_EMAIL", "PBOS_ACCEPTANCE_PASSWORD"
] as const;

export const PLAYBOOK_STAGING_MIGRATION_ENVIRONMENT = [
    "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ACCESS_TOKEN"
] as const;

export function playbookScholarProtectedEnvironmentFiles(workingDirectory: string,
    stateHome = process.env.PBOS_STATE_HOME ?? join(homedir(), ".pbos")) {
    return [
        { path: join(workingDirectory, ".env.local") },
        { path: join(stateHome, "secrets", "playbook-scholar-acceptance.env") }
    ] as const;
}

export async function inspectPlaybookScholarAcceptanceReadiness(workingDirectory: string,
    environment: NodeJS.ProcessEnv = process.env,
    stateHome = environment.PBOS_STATE_HOME ?? join(homedir(), ".pbos")): Promise<ProtectedEnvironmentReadiness> {
    return new ProtectedEnvironmentResolver(environment).inspect([{
        command: "pbos-functional-acceptance", args: [],
        requiredEnvironmentVariables: PLAYBOOK_SCHOLAR_ACCEPTANCE_ENVIRONMENT
    }], playbookScholarProtectedEnvironmentFiles(workingDirectory, stateHome));
}

export async function inspectPlaybookStagingMigrationReadiness(workingDirectory: string,
    environment: NodeJS.ProcessEnv = process.env,
    stateHome = environment.PBOS_STATE_HOME ?? join(homedir(), ".pbos")): Promise<ProtectedEnvironmentReadiness> {
    return new ProtectedEnvironmentResolver(environment).inspect([{
        command: "pbos-staging-migration", args: [],
        requiredEnvironmentVariables: PLAYBOOK_STAGING_MIGRATION_ENVIRONMENT
    }], playbookScholarProtectedEnvironmentFiles(workingDirectory, stateHome));
}

export interface PlaybookScholarStagingResource {
    readonly resource: string;
    readonly ready: boolean;
    readonly status: string;
}

export interface PlaybookScholarStagingReadiness {
    readonly ready: boolean;
    readonly environment: ProtectedEnvironmentReadiness;
    readonly resources: readonly PlaybookScholarStagingResource[];
    readonly blockers: readonly string[];
}

export function isAdditiveScholarMigrationEligible(staging: PlaybookScholarStagingReadiness): boolean {
    const structural = staging.resources.filter(item => !item.resource.startsWith("table:"));
    const tables = staging.resources.filter(item => item.resource.startsWith("table:"));
    return staging.environment.ready && structural.every(item => item.ready) && tables.length === scholarTables.length &&
        tables.some(item => !item.ready) && tables.every(item => item.ready || item.status.includes("HTTP_404_PGRST205"));
}

const scholarTables = PLAYBOOK_SCHOLAR_STAGING_TABLES;

export async function inspectPlaybookScholarStagingReadiness(workingDirectory: string,
    environment: NodeJS.ProcessEnv = process.env,
    stateHome = environment.PBOS_STATE_HOME ?? join(homedir(), ".pbos"),
    fetcher: typeof fetch = fetch): Promise<PlaybookScholarStagingReadiness> {
    const protectedEnvironment = new ProtectedEnvironmentResolver(environment);
    const files = playbookScholarProtectedEnvironmentFiles(workingDirectory, stateHome);
    const readiness = await inspectPlaybookScholarAcceptanceReadiness(workingDirectory, environment, stateHome);
    if (!readiness.ready) return { ready: false, environment: readiness, resources: [],
        blockers: [`Missing protected acceptance configuration: ${readiness.missing.join(", ")}.`] };
    const resolved = await protectedEnvironment.resolve([{
        command: "pbos-functional-acceptance", args: [],
        requiredEnvironmentVariables: PLAYBOOK_SCHOLAR_ACCEPTANCE_ENVIRONMENT
    }], files);
    const resources: PlaybookScholarStagingResource[] = [];
    let baseUrl: URL;
    try { baseUrl = new URL(resolved.NEXT_PUBLIC_SUPABASE_URL!); }
    catch {
        resources.push({ resource: "supabase-project", ready: false, status: "INVALID_PROJECT_URL" });
        return { ready: false, environment: readiness, resources,
            blockers: ["supabase-project:INVALID_PROJECT_URL"] };
    }
    const validProjectBoundary = baseUrl.protocol === "https:" && baseUrl.hostname.endsWith(".supabase.co");
    resources.push({ resource: "supabase-project", ready: validProjectBoundary,
        status: validProjectBoundary ? "HTTPS_PROJECT_BOUNDARY" : "INVALID_PROJECT_URL" });
    resources.push({ resource: "pbos-organization", ready: resolved.PBOS_ORGANIZATION_ID === "PLAYBOOK-ORG-001",
        status: resolved.PBOS_ORGANIZATION_ID === "PLAYBOOK-ORG-001" ? "MATCHED" : "MISMATCHED" });
    resources.push({ resource: "pbos-connector", ready: resolved.PBOS_CONNECTOR_ID === "PLAYBOOK-CONNECTOR-001",
        status: resolved.PBOS_CONNECTOR_ID === "PLAYBOOK-CONNECTOR-001" ? "MATCHED" : "MISMATCHED" });
    resources.push({ resource: "pbos-endpoint", ready: (() => {
        try { const endpoint = new URL(resolved.PBOS_API_URL!); return endpoint.protocol === "https:" && endpoint.pathname === "/pbos/v1"; }
        catch { return false; }
    })(), status: (() => {
        try { const endpoint = new URL(resolved.PBOS_API_URL!); return endpoint.protocol === "https:" && endpoint.pathname === "/pbos/v1" ? "HTTPS_PBOS_V1" : "INVALID_ENDPOINT"; }
        catch { return "INVALID_ENDPOINT"; }
    })() });
    for (const table of scholarTables) {
        try {
            const response = await fetcher(new URL(`/rest/v1/${table}?select=*&limit=0`, baseUrl), {
                headers: { apikey: resolved.SUPABASE_SERVICE_ROLE_KEY!,
                    authorization: `Bearer ${resolved.SUPABASE_SERVICE_ROLE_KEY!}` },
                signal: AbortSignal.timeout(10_000)
            });
            let code = "";
            if (!response.ok) {
                try { code = String((await response.json() as { code?: unknown }).code ?? ""); } catch { /* status is sufficient */ }
            }
            resources.push({ resource: `table:${table}`, ready: response.ok,
                status: response.ok ? `HTTP_${response.status}` : `HTTP_${response.status}${code ? `_${code}` : ""}` });
        } catch (error) {
            resources.push({ resource: `table:${table}`, ready: false,
                status: error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : "UNREACHABLE" });
        }
    }
    const blockers = resources.filter(item => !item.ready).map(item => `${item.resource}:${item.status}`);
    return { ready: blockers.length === 0, environment: readiness, resources, blockers };
}

export interface PlaybookStagingVerificationOptions {
    readonly workingDirectory: string;
    readonly environment?: NodeJS.ProcessEnv;
    readonly stateHome?: string;
    readonly fetcher?: typeof fetch;
    readonly wait?: (milliseconds: number) => Promise<void>;
    readonly maximumAttempts?: number;
    readonly initialDelayMs?: number;
    readonly maximumDelayMs?: number;
}

export async function waitForPlaybookScholarStagingReadiness(
    options: PlaybookStagingVerificationOptions): Promise<PlaybookScholarStagingReadiness> {
    const environment = options.environment ?? process.env;
    const stateHome = options.stateHome ?? environment.PBOS_STATE_HOME ?? join(homedir(), ".pbos");
    const fetcher = options.fetcher ?? fetch;
    const wait = options.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    const maximumAttempts = options.maximumAttempts ?? 8;
    const initialDelayMs = options.initialDelayMs ?? 500;
    const maximumDelayMs = options.maximumDelayMs ?? 5_000;
    if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1 || initialDelayMs < 0 || maximumDelayMs < 0) {
        throw new Error("Staging verification retry policy is invalid.");
    }
    let readiness = await inspectPlaybookScholarStagingReadiness(options.workingDirectory,
        environment, stateHome, fetcher);
    for (let attempt = 1; attempt < maximumAttempts && !readiness.ready; attempt += 1) {
        const unavailable = readiness.resources.filter(item => !item.ready);
        const schemaCachePending = unavailable.length > 0 && unavailable.every(item =>
            item.resource.startsWith("table:") && item.status.includes("HTTP_404_PGRST205"));
        if (!schemaCachePending) return readiness;
        await wait(Math.min(initialDelayMs * (2 ** (attempt - 1)), maximumDelayMs));
        readiness = await inspectPlaybookScholarStagingReadiness(options.workingDirectory,
            environment, stateHome, fetcher);
    }
    return readiness;
}

const playwrightConfig = `import { defineConfig, devices } from "@playwright/test";
import { release } from "node:os";

const useSystemChrome = process.platform === "darwin" && Number(release().split(".")[0]) <= 21;

export default defineConfig({
  testDir: "./tests/acceptance",
  outputDir: "artifacts/playwright",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL, trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...(useSystemChrome ? { channel: "chrome" } : {}) } }]
});
`;

const browserPreparation = `import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { release } from "node:os";

const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const useSystemChrome = process.platform === "darwin" && Number(release().split(".")[0]) <= 21;
if (useSystemChrome) {
  if (!existsSync(systemChrome)) {
    throw new Error("Playwright bundled Chromium is unsupported on this macOS release and Google Chrome is not installed.");
  }
  process.stdout.write("PBOS browser preparation: using installed Google Chrome.\\n");
} else {
  execFileSync(process.execPath, ["node_modules/playwright/cli.js", "install", "chromium"], { stdio: "inherit" });
}
`;

const scholarJourney = `import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error("Missing PBOS acceptance configuration: " + name);
  return value;
};

test("Scholar completes governed onboarding and receives a durable dashboard", async ({ page, request, context }) => {
  const artifacts = "artifacts/pbos-acceptance";
  await mkdir(artifacts, { recursive: true });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  const email = required("PBOS_ACCEPTANCE_EMAIL");
  const password = required("PBOS_ACCEPTANCE_PASSWORD");
  const admin = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  let user = users.data.users.find(candidate => candidate.email === email);
  if (!user) {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { role: "scholar", profile_mode: "scholar", synthetic: true } });
    if (created.error || !created.data.user) throw created.error ?? new Error("Synthetic Scholar creation failed.");
    user = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (updated.error) throw updated.error;
  }

  const anonymous = await request.post("/api/pbos/scholar/onboarding", {
    data: { displayName: "PBOS Acceptance Scholar", goalTitle: "Complete governed onboarding" }
  });
  expect(anonymous.status()).toBe(401);

  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await page.waitForURL(/\\/dashboard/);
  await expect(page.locator('[data-visual-canon="PGSL-007"]')).toBeVisible();

  const onboarding = await page.request.post("/api/pbos/scholar/onboarding", {
    data: { displayName: "PBOS Acceptance Scholar", goalTitle: "Complete governed onboarding" },
    timeout: 120_000
  });
  const onboardingBody = await onboarding.text();
  expect(onboarding.ok(), onboardingBody).toBe(true);
  const transaction = JSON.parse(onboardingBody) as { dashboard?: { provenance?: string[] } };
  expect(transaction.dashboard?.provenance?.length).toBeGreaterThan(0);

  const projection = await admin.from("scholar_dashboard_projections")
    .select("scholar_id,goal_id,section_ids,exchange_approval_id,provenance")
    .eq("scholar_id", user.id).maybeSingle();
  if (projection.error) throw projection.error;
  expect(projection.data?.scholar_id).toBe(user.id);
  expect(projection.data?.goal_id).toBeTruthy();
  expect(projection.data?.section_ids).toEqual(expect.arrayContaining(["identity", "goals"]));
  expect((projection.data?.provenance as string[] | undefined)?.length).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: artifacts + "/scholar-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByText("Scholar Dashboard", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: artifacts + "/scholar-mobile.png", fullPage: true });

  const accessibility = await new AxeBuilder({ page }).analyze();
  const blocking = accessibility.violations.filter(violation => ["serious", "critical"].includes(violation.impact ?? ""));
  await writeFile(artifacts + "/scholar-accessibility.json", JSON.stringify(accessibility, null, 2));
  expect(blocking).toEqual([]);

  await context.tracing.stop({ path: artifacts + "/scholar-trace.zip" });
  await writeFile(artifacts + "/scholar-acceptance.json", JSON.stringify({
    schemaVersion: 1,
    journeyId: "SCHOLAR-ONBOARDING-TO-DASHBOARD",
    commit: required("PBOS_ACCEPTANCE_COMMIT"),
    checks: [
      { dimension: "ROUTE", passed: true, detail: "Login, onboarding API, and dashboard routes executed." },
      { dimension: "DURABLE_DATA", passed: true, detail: "Owner-scoped dashboard projection was read from Supabase after mutation." },
      { dimension: "AUTHORITY", passed: true, detail: "Anonymous onboarding was denied before the authenticated transaction." },
      { dimension: "PBOS_INTEGRATION", passed: true, detail: "Signed PBOS transaction returned provenance-bearing dashboard evidence." },
      { dimension: "VISUAL_CANON", passed: true, detail: "The rendered Scholar dashboard declared approved visual canon PGSL-007." },
      { dimension: "SECURITY", passed: true, detail: "Synthetic credentials remained environment-bound and anonymous mutation failed closed." }
    ]
  }, null, 2));
});
`;

export function withPlaybookAcceptancePackage(source: string): string {
    const manifest = JSON.parse(source) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
    };
    manifest.scripts = { ...(manifest.scripts ?? {}),
        "pbos:acceptance:prepare": "node scripts/pbos/prepare-browser.mjs",
        "test:acceptance:pbos": "playwright test tests/acceptance/pbos-scholar.spec.ts --project=chromium" };
    manifest.devDependencies = { ...(manifest.devDependencies ?? {}),
        "@axe-core/playwright": "^4.10.2", "@playwright/test": "^1.55.0" };
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function playbookScholarAcceptanceFiles(packageSource: string): readonly RepositoryFileChange[] {
    return [
        { path: "package.json", content: withPlaybookAcceptancePackage(packageSource) },
        { path: "scripts/pbos/prepare-browser.mjs", content: browserPreparation },
        { path: "playwright.config.ts", content: playwrightConfig },
        { path: "tests/acceptance/pbos-scholar.spec.ts", content: scholarJourney }
    ];
}

export async function playbookScholarAcceptancePlan(gateway: GitHubRepositoryGateway,
    reference: RepositoryReference, branch: string, revision: string): Promise<FunctionalAcceptancePlan> {
    const workingDirectory = await gateway.workingDirectory(reference);
    return {
        planId: `playbook-scholar-acceptance:${revision}`,
        systemId: "PLAYBOOK-SYSTEM-001",
        productNodeId: "PLAYBOOK-SCHOLAR-ONBOARDING",
        journeyId: "SCHOLAR-ONBOARDING-TO-DASHBOARD",
        repository: "sgwalton87/playbook-platform",
        branch,
        commit: revision,
        workingDirectory,
        protectedEnvironmentFiles: playbookScholarProtectedEnvironmentFiles(workingDirectory),
        prerequisites: [
            { command: "npm", args: ["ci", "--no-audit", "--no-fund"], timeoutMs: 900_000 },
            { command: "npm", args: ["run", "pbos:acceptance:prepare"], timeoutMs: 300_000 }
        ],
        minimumFreeBytes: 1024 * 1024 * 1024,
        launch: { command: "npm", args: ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "4311"],
            baseUrl: "http://127.0.0.1:4311", healthPath: "/login", startupTimeoutMs: 120_000,
            requiredEnvironmentVariables: PLAYBOOK_SCHOLAR_ACCEPTANCE_ENVIRONMENT },
        probes: [
            { probeId: "scholar-login-route", dimension: "ROUTE", behavior: "The Playbook login route renders.",
                path: "/login", expectedStatus: 200 },
            { probeId: "scholar-anonymous-authority", dimension: "AUTHORITY",
                behavior: "Anonymous Scholar onboarding is denied.", method: "POST", path: "/api/pbos/scholar/onboarding",
                requestBody: { displayName: "Anonymous", goalTitle: "Denied" }, expectedStatus: 401 },
            { probeId: "scholar-anonymous-security", dimension: "SECURITY",
                behavior: "Unauthenticated mutation fails closed before persistence.", method: "POST",
                path: "/api/pbos/scholar/onboarding", requestBody: { displayName: "Anonymous", goalTitle: "Denied" }, expectedStatus: 401 }
        ],
        browserJourneys: [{ journeyId: "SCHOLAR-ONBOARDING-TO-DASHBOARD", persona: "SCHOLAR",
            behavior: "A real Scholar signs in, completes the signed PBOS onboarding transaction, and receives a durable dashboard.",
            route: "/login", engine: "PLAYWRIGHT",
            command: { command: "npm", args: ["run", "test:acceptance:pbos"],
                requiredEnvironmentVariables: PLAYBOOK_SCHOLAR_ACCEPTANCE_ENVIRONMENT,
                publicEnvironment: { PLAYWRIGHT_BASE_URL: "http://127.0.0.1:4311", PBOS_ACCEPTANCE_COMMIT: revision },
                timeoutMs: 300_000 },
            viewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
            screenshotArtifacts: ["artifacts/pbos-acceptance/scholar-desktop.png", "artifacts/pbos-acceptance/scholar-mobile.png"],
            traceArtifact: "artifacts/pbos-acceptance/scholar-trace.zip",
            accessibilityArtifact: "artifacts/pbos-acceptance/scholar-accessibility.json",
            acceptanceArtifact: "artifacts/pbos-acceptance/scholar-acceptance.json",
            visualCanon: {
                screenId: "PGSL-007",
                manifestPath: "docs/design/canon/scholar-dashboard/manifest.json",
                requiredRoute: "/dashboard",
                requiredAssets: [
                    "docs/design/canon/scholar-dashboard/playbook-experience-board-2026-07-24.png",
                    "docs/design/canon/scholar-dashboard/starting-five-board-2026-07-23.png",
                    "public/brand/scholar-dashboard/scholar-future-hero-v1.png"
                ]
            },
            verifiedDimensions: ["DURABLE_DATA", "PBOS_INTEGRATION"]
        }]
    };
}
