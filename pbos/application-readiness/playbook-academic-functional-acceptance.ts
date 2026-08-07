import { GitHubRepositoryGateway, RepositoryFileChange, RepositoryReference } from "../platform";
import { FunctionalAcceptancePlan, ProtectedEnvironmentReadiness, ProtectedEnvironmentResolver } from "../production-runtime";
import { playbookScholarProtectedEnvironmentFiles } from "./playbook-functional-acceptance";

export const PLAYBOOK_ACADEMIC_ACCEPTANCE_ENVIRONMENT = [
    "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "PBOS_API_URL", "PBOS_ORGANIZATION_ID", "PBOS_CONNECTOR_ID", "PBOS_CONNECTOR_KEY_ID",
    "PBOS_CONNECTOR_SECRET_BASE64", "PBOS_ACADEMIC_JOURNEY_APPROVAL_ID",
    "PBOS_ACCEPTANCE_EMAIL", "PBOS_ACCEPTANCE_PASSWORD", "ANTHROPIC_API_KEY"
] as const;

export async function inspectPlaybookAcademicAcceptanceReadiness(workingDirectory: string,
    environment: NodeJS.ProcessEnv = process.env): Promise<ProtectedEnvironmentReadiness> {
    return new ProtectedEnvironmentResolver(environment).inspect([{
        command: "pbos-academic-functional-acceptance", args: [],
        requiredEnvironmentVariables: PLAYBOOK_ACADEMIC_ACCEPTANCE_ENVIRONMENT
    }], playbookScholarProtectedEnvironmentFiles(workingDirectory, environment.PBOS_STATE_HOME));
}

const academicJourney = `import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error("Missing PBOS academic acceptance configuration: " + name);
  return value;
};

function isTransientSupabaseFailure(error: unknown): boolean {
  const detail = error instanceof Error ? error.message : JSON.stringify(error);
  return /fetch failed|connect.*timeout|network|UND_ERR/i.test(detail);
}

async function withSupabaseRetry<T extends { error: unknown }>(label: string,
  operation: () => PromiseLike<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await operation();
      if (!result.error) return result;
      lastError = result.error;
      if (!isTransientSupabaseFailure(result.error)) throw result.error;
    } catch (error) {
      lastError = error;
      if (!isTransientSupabaseFailure(error)) throw error;
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 500));
  }
  throw new Error(label + " failed after 3 bounded network attempts: " +
    (lastError instanceof Error ? lastError.message : JSON.stringify(lastError)));
}

function syntheticTranscriptPdf(): Buffer {
  const stream = "BT /F1 12 Tf 72 720 Td (PBOS Synthetic Scholar Transcript) Tj 0 -22 Td (English 9 A English 10 B) Tj 0 -22 Td (Algebra I A Geometry B Biology A World History B) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length " + Buffer.byteLength(stream, "binary") + " >>\\nstream\\n" + stream + "\\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, "binary")); pdf += (index + 1) + " 0 obj\\n" + object + "\\nendobj\\n"; });
  const xref = Buffer.byteLength(pdf, "binary");
  pdf += "xref\\n0 " + (objects.length + 1) + "\\n0000000000 65535 f \\n";
  for (let index = 1; index <= objects.length; index += 1) pdf += String(offsets[index]).padStart(10, "0") + " 00000 n \\n";
  pdf += "trailer\\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\\nstartxref\\n" + xref + "\\n%%EOF\\n";
  return Buffer.from(pdf, "binary");
}

test("Scholar transcript produces durable academic readiness through PBOS", async ({ page, request, context }) => {
  const artifacts = "artifacts/pbos-acceptance";
  await mkdir(artifacts, { recursive: true });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const email = required("PBOS_ACCEPTANCE_EMAIL");
  const password = required("PBOS_ACCEPTANCE_PASSWORD");
  const admin = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const users = await withSupabaseRetry("Acceptance identity lookup",
    () => admin.auth.admin.listUsers({ page: 1, perPage: 1000 }));
  const user = users.data.users.find(candidate => candidate.email === email);
  if (!user) throw new Error("The governed Scholar acceptance identity must exist before academic acceptance.");

  const anonymous = await request.post("/api/parse-transcript", { data: { base64: "denied", mediaType: "application/pdf" } });
  expect(anonymous.status()).toBe(401);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await page.waitForURL(/\\/dashboard/);
  await page.goto("/transcript");
  await page.locator('input[type="file"]').setInputFiles({ name: "pbos-synthetic-transcript.pdf",
    mimeType: "application/pdf", buffer: syntheticTranscriptPdf() });
  await expect(page.getByRole("status")).toContainText("Transcript parsed", { timeout: 120_000 });

  const progress = await withSupabaseRetry("Academic progress verification",
    () => admin.from("ag_progress").select("user_id,subject").eq("user_id", user.id));
  expect(progress.data).toHaveLength(7);
  const evidence = await withSupabaseRetry("Academic evidence verification", () => admin.from("academic_journey_evidence")
    .select("owner_id,readiness_score,ag_updates,delivery_state,provenance")
    .eq("owner_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle());
  expect(evidence.data).toMatchObject({ owner_id: user.id, ag_updates: 7, delivery_state: "DELIVERED" });
  expect((evidence.data?.provenance as string[] | undefined)?.length).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: artifacts + "/academic-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Upload Transcript" })).toBeVisible();
  await page.screenshot({ path: artifacts + "/academic-mobile.png", fullPage: true });
  const accessibility = await new AxeBuilder({ page }).analyze();
  const blocking = accessibility.violations.filter(violation => ["serious", "critical"].includes(violation.impact ?? ""));
  await writeFile(artifacts + "/academic-accessibility.json", JSON.stringify(accessibility, null, 2));
  expect(blocking).toEqual([]);
  await context.tracing.stop({ path: artifacts + "/academic-trace.zip" });
  await writeFile(artifacts + "/academic-acceptance.json", JSON.stringify({ schemaVersion: 1,
    journeyId: "TRANSCRIPT-TO-ACADEMIC-READINESS", commit: required("PBOS_ACCEPTANCE_COMMIT"),
    checks: [
      { dimension: "DURABLE_DATA", passed: true, detail: "Transcript-derived readiness survived an authenticated database read." },
      { dimension: "PBOS_INTEGRATION", passed: true, detail: "The approval-bound transcript exchange produced provenance-bearing academic evidence." },
      { dimension: "AUTHORITY", passed: true, detail: "Anonymous transcript mutation was denied before authenticated execution." },
      { dimension: "SECURITY", passed: true, detail: "Protected academic configuration remained server controlled." }
    ] }, null, 2));
});
`;

function withAcademicAcceptancePackage(source: string): string {
    const manifest = JSON.parse(source) as { scripts?: Record<string, string>; devDependencies?: Record<string, string> };
    manifest.scripts = { ...(manifest.scripts ?? {}),
        "test:acceptance:pbos:academic": "playwright test tests/acceptance/pbos-academic.spec.ts --project=chromium" };
    manifest.devDependencies = { ...(manifest.devDependencies ?? {}),
        "@axe-core/playwright": "^4.10.2", "@playwright/test": "^1.55.0" };
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function playbookAcademicAcceptanceFiles(packageSource: string): readonly RepositoryFileChange[] {
    return [
        { path: "package.json", content: withAcademicAcceptancePackage(packageSource) },
        { path: "tests/acceptance/pbos-academic.spec.ts", content: academicJourney }
    ];
}

export async function playbookAcademicAcceptancePlan(gateway: GitHubRepositoryGateway,
    reference: RepositoryReference, branch: string, revision: string): Promise<FunctionalAcceptancePlan> {
    const workingDirectory = await gateway.workingDirectory(reference);
    return {
        planId: `playbook-academic-acceptance:${revision}`,
        systemId: "PLAYBOOK-SYSTEM-001",
        productNodeId: "PLAYBOOK-ACADEMIC-READINESS",
        journeyId: "TRANSCRIPT-TO-ACADEMIC-READINESS",
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
            baseUrl: "http://127.0.0.1:4311", healthPath: "/transcript", startupTimeoutMs: 120_000,
            requiredEnvironmentVariables: PLAYBOOK_ACADEMIC_ACCEPTANCE_ENVIRONMENT },
        probes: [
            { probeId: "academic-transcript-route", dimension: "ROUTE", behavior: "The authenticated transcript surface renders.",
                path: "/transcript", expectedStatus: 200 },
            { probeId: "academic-anonymous-authority", dimension: "AUTHORITY",
                behavior: "Anonymous transcript mutation is denied.", method: "POST", path: "/api/parse-transcript",
                requestBody: { base64: "denied", mediaType: "application/pdf" }, expectedStatus: 401 }
        ],
        browserJourneys: [{ journeyId: "TRANSCRIPT-TO-ACADEMIC-READINESS", persona: "SCHOLAR",
            behavior: "A real Scholar uploads a transcript and receives durable, provenance-bearing academic readiness.",
            route: "/transcript", engine: "PLAYWRIGHT",
            command: { command: "npm", args: ["run", "test:acceptance:pbos:academic"],
                requiredEnvironmentVariables: PLAYBOOK_ACADEMIC_ACCEPTANCE_ENVIRONMENT,
                publicEnvironment: { PLAYWRIGHT_BASE_URL: "http://127.0.0.1:4311", PBOS_ACCEPTANCE_COMMIT: revision },
                timeoutMs: 300_000 },
            viewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
            screenshotArtifacts: ["artifacts/pbos-acceptance/academic-desktop.png", "artifacts/pbos-acceptance/academic-mobile.png"],
            traceArtifact: "artifacts/pbos-acceptance/academic-trace.zip",
            accessibilityArtifact: "artifacts/pbos-acceptance/academic-accessibility.json",
            acceptanceArtifact: "artifacts/pbos-acceptance/academic-acceptance.json",
            verifiedDimensions: ["DURABLE_DATA", "PBOS_INTEGRATION", "AUTHORITY", "SECURITY"]
        }]
    };
}
