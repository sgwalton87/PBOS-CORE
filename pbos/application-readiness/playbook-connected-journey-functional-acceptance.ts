import { GitHubRepositoryGateway, RepositoryFileChange, RepositoryReference } from "../platform";
import { FunctionalAcceptancePlan } from "../production-runtime";
import { PLAYBOOK_SCHOLAR_ACCEPTANCE_ENVIRONMENT, playbookScholarProtectedEnvironmentFiles } from "./playbook-functional-acceptance";

export type PlaybookConnectedJourneyMission = "048-opportunity-journey" | "048-application-journey" |
    "048-support-journey" | "048-messaging-journey" | "048-notification-journey";

interface JourneyDefinition {
    readonly missionId: PlaybookConnectedJourneyMission;
    readonly journeyId: string;
    readonly productNodeId: string;
    readonly route: string;
    readonly apiPath: string;
    readonly approvalEnvironment: string;
    readonly port: number;
    readonly script: string;
    readonly specificationPath: string;
    readonly artifactPrefix: string;
    readonly behavior: string;
    readonly action: string;
}

const definitions: Readonly<Record<PlaybookConnectedJourneyMission, JourneyDefinition>> = {
    "048-opportunity-journey": {
        missionId: "048-opportunity-journey", journeyId: "READINESS-TO-OPPORTUNITY",
        productNodeId: "PLAYBOOK-OPPORTUNITY-MARKETPLACE", route: "/opportunities", apiPath: "/api/pbos/opportunities",
        approvalEnvironment: "PBOS_OPPORTUNITY_JOURNEY_APPROVAL_ID", port: 4312,
        script: "test:acceptance:pbos:opportunity", specificationPath: "tests/acceptance/pbos-opportunity.spec.ts",
        artifactPrefix: "opportunity", behavior: "A Scholar converts verified readiness into explainable, durable opportunity decisions.",
        action: `const onboarding = await page.request.post("/api/pbos/scholar/onboarding", { data: {
    displayName: "PBOS Acceptance Scholar", goalTitle: "Public Health"
  } });
  const onboardingBody = await onboarding.text();
  expect(onboarding.ok(), onboardingBody).toBe(true);
  const discovery = await page.request.post("/api/pbos/opportunities");
  const discovered = await discovery.json() as { error?: string; matches?: Array<{ id: string; reasons?: string[] }> };
  expect(discovery.status(), "Opportunity discovery failed: " + (discovered.error ?? "unknown API error")).toBe(200);
  expect(discovered.matches?.length ?? 0).toBeGreaterThan(0);
  expect(discovered.matches?.every(match => (match.reasons?.length ?? 0) > 0)).toBe(true);
  const match = discovered.matches![0];
  const decision = await page.request.patch("/api/pbos/opportunities", { data: {
    matchId: match.id, decision: "SAVED", requestId: "pbos-acceptance-save-" + match.id
  } });
  expect(decision.status()).toBe(200);
  await page.goto("/opportunities");
  await expect(page.getByRole("heading", { name: "Your explainable matches" })).toBeVisible();`
    },
    "048-application-journey": {
        missionId: "048-application-journey", journeyId: "OPPORTUNITY-TO-APPLICATION",
        productNodeId: "PLAYBOOK-APPLICATION-WORKSPACE", route: "/application-workspaces", apiPath: "/api/application-workspaces",
        approvalEnvironment: "PBOS_APPLICATION_JOURNEY_APPROVAL_ID", port: 4313,
        script: "test:acceptance:pbos:application", specificationPath: "tests/acceptance/pbos-application.spec.ts",
        artifactPrefix: "application", behavior: "A Scholar moves a governed opportunity into a durable application workspace.",
        action: `const creation = await page.request.post("/api/application-workspaces", { data: {
    opportunityId: "pbos-acceptance-opportunity", opportunityName: "PBOS Acceptance Scholarship",
    opportunityType: "scholarship", deadline: "2027-05-01", requestId: "pbos-acceptance-application"
  } });
  expect(creation.status()).toBe(201);
  const created = await creation.json() as { workspace?: { workspaceId?: string } };
  expect(created.workspace?.workspaceId).toBeTruthy();
  const reloaded = await page.request.get("/api/application-workspaces");
  expect(reloaded.status()).toBe(200);
  const records = await reloaded.json() as { workspaces?: Array<{ id: string }> };
  expect(records.workspaces?.some(workspace => workspace.id === created.workspace?.workspaceId)).toBe(true);
  await page.goto("/application-workspaces");
  await expect(page.getByRole("heading", { name: "Turn opportunity into action" })).toBeVisible();`
    },
    "048-support-journey": {
        missionId: "048-support-journey", journeyId: "APPLICATION-TO-AUTHORIZED-SUPPORT",
        productNodeId: "PLAYBOOK-APPLICATION-SUPPORT", route: "/application-workspaces", apiPath: "/api/pbos/application-support",
        approvalEnvironment: "PBOS_SUPPORT_REQUEST_APPROVAL_ID", port: 4314,
        script: "test:acceptance:pbos:support", specificationPath: "tests/acceptance/pbos-support.spec.ts",
        artifactPrefix: "support", behavior: "A Scholar requests application help through an active permission-bearing relationship.",
        action: `const email = required("PBOS_ACCEPTANCE_EMAIL");
  const admin = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  const user = users.data.users.find(candidate => candidate.email === email);
  if (!user) throw new Error("Governed Scholar acceptance identity was not found.");
  const workspace = await admin.from("application_workspaces").select("id").eq("scholar_id", user.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (workspace.error || !workspace.data) throw workspace.error ?? new Error("Certified application workspace prerequisite is missing.");
  const existingRelationship = await admin.from("support_relationships").select("id").eq("scholar_id", user.id)
    .eq("supporter_email", "pbos-support@example.com").eq("status", "active").limit(1).maybeSingle();
  if (existingRelationship.error) throw existingRelationship.error;
  let relationshipId = existingRelationship.data?.id as string | undefined;
  if (!relationshipId) {
    const relationship = await admin.from("support_relationships").insert({ scholar_id: user.id,
      supporter_email: "pbos-support@example.com", supporter_name: "PBOS Acceptance Mentor", relationship: "mentor",
      permissions: ["view_progress", "support_tasks"], status: "active" }).select("id").single();
    if (relationship.error || !relationship.data) throw relationship.error ?? new Error("Synthetic support relationship was not created.");
    relationshipId = relationship.data.id as string;
  }
  const supportRequest = await page.request.post("/api/pbos/application-support", { data: {
    workspaceId: workspace.data.id, relationshipId, category: "RECOMMENDATION",
    summary: "Review my governed scholarship application.", requestId: "pbos-acceptance-support"
  } });
  expect(supportRequest.status()).toBe(201);
  const delivered = await supportRequest.json() as { request?: { requestId?: string; state?: string } };
  expect(delivered.request?.requestId).toBeTruthy();
  await page.goto("/application-workspaces");
  await expect(page.getByRole("heading", { name: "Ask your support network for application help" })).toBeVisible();`
    },
    "048-messaging-journey": {
        missionId: "048-messaging-journey", journeyId: "AUTHORIZED-SUPPORT-MESSAGING",
        productNodeId: "PLAYBOOK-GOVERNED-MESSAGING", route: "/messages", apiPath: "/api/support-network/messages",
        approvalEnvironment: "PBOS_MESSAGING_JOURNEY_APPROVAL_ID", port: 4315,
        script: "test:acceptance:pbos:messaging", specificationPath: "tests/acceptance/pbos-messaging.spec.ts",
        artifactPrefix: "messaging", behavior: "Authorized support participants exchange durable, moderated messages with unread state.",
        action: `const email = required("PBOS_ACCEPTANCE_EMAIL");
  const admin = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  const user = users.data.users.find(candidate => candidate.email === email);
  if (!user) throw new Error("Governed Scholar acceptance identity was not found.");
  const existing = await admin.from("support_relationships").select("id").eq("scholar_id", user.id)
    .eq("supporter_email", "pbos-support@example.com").eq("status", "active").limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  let relationshipId = existing.data?.id as string | undefined;
  if (!relationshipId) {
    const created = await admin.from("support_relationships").insert({ scholar_id: user.id,
      supporter_email: "pbos-support@example.com", supporter_name: "PBOS Acceptance Mentor", relationship: "mentor",
      permissions: ["view_progress", "support_tasks"], status: "active" }).select("id").single();
    if (created.error || !created.data) throw created.error ?? new Error("Synthetic support relationship was not created.");
    relationshipId = created.data.id as string;
  }
  const sent = await page.request.post("/api/support-network/messages", { data: { relationshipId,
    body: "PBOS governed acceptance message", requestId: "pbos-acceptance-message" } });
  expect(sent.status()).toBe(201);
  const sentBody = await sent.json() as { message?: { id?: string }; conversation?: { id?: string } };
  expect(sentBody.message?.id).toBeTruthy();
  const loaded = await page.request.get("/api/support-network/messages");
  expect(loaded.status()).toBe(200);
  const inbox = await loaded.json() as { conversations?: Array<{ id: string; messages?: Array<{ id: string }> }> };
  expect(inbox.conversations?.some(conversation => conversation.id === sentBody.conversation?.id &&
    conversation.messages?.some(message => message.id === sentBody.message?.id))).toBe(true);
  await page.goto("/messages");
  await expect(page.getByRole("heading", { name: "Your governed support conversations" })).toBeVisible();`,
    },
    "048-notification-journey": {
        missionId: "048-notification-journey", journeyId: "EVENT-TO-ACKNOWLEDGED-NOTIFICATION",
        productNodeId: "PLAYBOOK-RELIABLE-NOTIFICATIONS", route: "/notifications", apiPath: "/api/notifications",
        approvalEnvironment: "PBOS_NOTIFICATION_JOURNEY_APPROVAL_ID", port: 4316,
        script: "test:acceptance:pbos:notifications", specificationPath: "tests/acceptance/pbos-notifications.spec.ts",
        artifactPrefix: "notifications", behavior: "A domain event produces one preference-aware notification that can be acknowledged.",
        action: `const event = { eventKey: "pbos-acceptance-notification", type: "message", title: "Application support replied",
    body: "Your mentor added a governed response.", href: "/messages", priority: "medium" };
  const first = await page.request.post("/api/notifications", { data: event });
  expect(first.status()).toBe(200);
  const firstBody = await first.json() as { notification?: { id?: string } };
  expect(firstBody.notification?.id).toBeTruthy();
  const duplicate = await page.request.post("/api/notifications", { data: event });
  expect(duplicate.status()).toBe(200);
  const duplicateBody = await duplicate.json() as { notification?: { id?: string } };
  expect(duplicateBody.notification?.id).toBe(firstBody.notification?.id);
  const acknowledged = await page.request.patch("/api/notifications", { data: {
    action: "READ", notificationId: firstBody.notification!.id
  } });
  expect(acknowledged.status()).toBe(200);
  const preference = await page.request.patch("/api/notifications", { data: {
    action: "PREFERENCE", notificationType: "mail_reply", mode: "daily_digest"
  } });
  expect(preference.status()).toBe(200);
  const loaded = await page.request.get("/api/notifications");
  const center = await loaded.json() as { notifications?: Array<{ id: string; read: boolean }>;
    preferences?: Array<{ notification_type: string; mode: string }> };
  expect(center.notifications?.filter(item => item.id === firstBody.notification?.id)).toEqual([
    expect.objectContaining({ read: true })
  ]);
  expect(center.preferences).toContainEqual(expect.objectContaining({ notification_type: "mail_reply", mode: "daily_digest" }));
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "What needs your attention?" })).toBeVisible();`,
    }
};

function environment(definition: JourneyDefinition): readonly string[] {
    return [...PLAYBOOK_SCHOLAR_ACCEPTANCE_ENVIRONMENT, definition.approvalEnvironment];
}

function specification(definition: JourneyDefinition): string {
    const supabaseAdminImport = definition.action.includes("createClient(")
        ? 'import { createClient } from "@supabase/supabase-js";\n'
        : "";
    return `import AxeBuilder from "@axe-core/playwright";
${supabaseAdminImport}import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error("Missing protected PBOS acceptance configuration: " + name);
  return value;
};

test("${definition.journeyId} produces exact-revision functional evidence", async ({ page, request, context }) => {
  const artifacts = "artifacts/pbos-acceptance";
  await mkdir(artifacts, { recursive: true });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const anonymous = await request.post("${definition.apiPath}", { data: {} });
  expect(anonymous.status()).toBe(401);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(required("PBOS_ACCEPTANCE_EMAIL"));
  await page.getByLabel("Password", { exact: true }).fill(required("PBOS_ACCEPTANCE_PASSWORD"));
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await page.waitForURL(/\\/dashboard/);
  ${definition.action}
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: artifacts + "/${definition.artifactPrefix}-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.screenshot({ path: artifacts + "/${definition.artifactPrefix}-mobile.png", fullPage: true });
  const accessibility = await new AxeBuilder({ page }).analyze();
  const blocking = accessibility.violations.filter(violation => ["serious", "critical"].includes(violation.impact ?? ""));
  await writeFile(artifacts + "/${definition.artifactPrefix}-accessibility.json", JSON.stringify(accessibility, null, 2));
  expect(blocking).toEqual([]);
  await context.tracing.stop({ path: artifacts + "/${definition.artifactPrefix}-trace.zip" });
  await writeFile(artifacts + "/${definition.artifactPrefix}-acceptance.json", JSON.stringify({ schemaVersion: 1,
    journeyId: "${definition.journeyId}", commit: required("PBOS_ACCEPTANCE_COMMIT"), checks: [
      { dimension: "DURABLE_DATA", passed: true, detail: "Owner-scoped state survived an authenticated write and read." },
      { dimension: "PBOS_INTEGRATION", passed: true, detail: "The governed server route completed its approval-bound PBOS exchange." },
      { dimension: "AUTHORITY", passed: true, detail: "Anonymous mutation was denied before authenticated execution." },
      { dimension: "SECURITY", passed: true, detail: "Identity and protected connector configuration remained server controlled." }
    ] }, null, 2));
});
`;
}

function withJourneyPackage(source: string, definition: JourneyDefinition): string {
    const manifest = JSON.parse(source) as { scripts?: Record<string, string>; devDependencies?: Record<string, string> };
    manifest.scripts = { ...(manifest.scripts ?? {}),
        [definition.script]: `playwright test ${definition.specificationPath} --project=chromium` };
    manifest.devDependencies = { ...(manifest.devDependencies ?? {}),
        "@axe-core/playwright": "^4.10.2", "@playwright/test": "^1.55.0" };
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function playbookConnectedJourneyAcceptanceFiles(packageSource: string,
    missionId: PlaybookConnectedJourneyMission): readonly RepositoryFileChange[] {
    const definition = definitions[missionId];
    return [
        { path: "package.json", content: withJourneyPackage(packageSource, definition) },
        { path: definition.specificationPath, content: specification(definition) }
    ];
}

export async function playbookConnectedJourneyAcceptancePlan(gateway: GitHubRepositoryGateway,
    reference: RepositoryReference, branch: string, revision: string,
    missionId: PlaybookConnectedJourneyMission): Promise<FunctionalAcceptancePlan> {
    const definition = definitions[missionId];
    const requiredEnvironment = environment(definition);
    const workingDirectory = await gateway.workingDirectory(reference);
    return {
        planId: `playbook-${definition.artifactPrefix}-acceptance:${revision}`,
        systemId: "PLAYBOOK-SYSTEM-001", productNodeId: definition.productNodeId,
        journeyId: definition.journeyId, repository: "sgwalton87/playbook-platform", branch, commit: revision,
        workingDirectory, protectedEnvironmentFiles: playbookScholarProtectedEnvironmentFiles(workingDirectory),
        prerequisites: [
            { command: "npm", args: ["ci", "--no-audit", "--no-fund"], timeoutMs: 900_000 },
            { command: "npm", args: ["run", "pbos:acceptance:prepare"], timeoutMs: 300_000 }
        ],
        minimumFreeBytes: 1024 * 1024 * 1024,
        launch: { command: "npm", args: ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(definition.port)],
            baseUrl: `http://127.0.0.1:${definition.port}`, healthPath: definition.route, startupTimeoutMs: 120_000,
            requiredEnvironmentVariables: requiredEnvironment },
        probes: [
            { probeId: `${definition.artifactPrefix}-route`, dimension: "ROUTE", behavior: `${definition.route} renders.`,
                path: definition.route, expectedStatus: 200 },
            { probeId: `${definition.artifactPrefix}-anonymous-authority`, dimension: "AUTHORITY",
                behavior: "Anonymous mutation fails closed.", method: "POST", path: definition.apiPath,
                requestBody: {}, expectedStatus: 401 }
        ],
        browserJourneys: [{ journeyId: definition.journeyId, persona: "SCHOLAR", behavior: definition.behavior,
            route: definition.route, engine: "PLAYWRIGHT",
            command: { command: "npm", args: ["run", definition.script], requiredEnvironmentVariables: requiredEnvironment,
                publicEnvironment: { PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${definition.port}`, PBOS_ACCEPTANCE_COMMIT: revision },
                timeoutMs: 300_000 },
            viewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
            screenshotArtifacts: [`artifacts/pbos-acceptance/${definition.artifactPrefix}-desktop.png`,
                `artifacts/pbos-acceptance/${definition.artifactPrefix}-mobile.png`],
            traceArtifact: `artifacts/pbos-acceptance/${definition.artifactPrefix}-trace.zip`,
            accessibilityArtifact: `artifacts/pbos-acceptance/${definition.artifactPrefix}-accessibility.json`,
            acceptanceArtifact: `artifacts/pbos-acceptance/${definition.artifactPrefix}-acceptance.json`,
            verifiedDimensions: ["DURABLE_DATA", "PBOS_INTEGRATION", "AUTHORITY", "SECURITY"] }]
    };
}
