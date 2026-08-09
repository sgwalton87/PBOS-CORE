import { describe, expect, it } from "vitest";
import { compilePlaybookUserJourneys, parsePlaybookRoleJourneys, parseProductAcceptanceJourneys,
    playbookCanonJourneysExecutor } from "../playbook-canon-journeys-executor";
import { PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS } from "../playbook-full-canonical-roadmap";

const roles = `# Role Registry
| Role | Signup | Onboarding | OS Route | Dashboard | Permissions | Record Type | Playbook Record | Scholar Record | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Scholar | VERIFIED: scholar. | VERIFIED: role onboarding. | VERIFIED: /dashboard. | VERIFIED: app/dashboard/page.tsx. | VERIFIED: scholar permissions. | VERIFIED: scholar. | PARTIAL: record projection missing. | PARTIAL: Scholar Record missing. | PARTIAL: email only. | PARTIAL |
| Employer | VERIFIED: employer. | MISSING: no onboarding. | PARTIAL: /employer-os. | VERIFIED: app/employer-os/page.tsx. | VERIFIED: employer permissions. | PARTIAL: organization. | MISSING: no record. | MISSING: candidate link. | MISSING: verification. | MISSING |`;
const sprints = `## Sprint OR-001 — Canonical role registry and routing
## Sprint OR-002 — Unified premium onboarding shell

## Product acceptance journeys

| Journey ID | Canonical coverage |
| --- | --- |
| SCHOLAR-ONBOARDING-TO-DASHBOARD | Scholar onboarding and dashboard coverage. |
| TRANSCRIPT-TO-ACADEMIC-READINESS | Transcript to academic readiness. |
| READINESS-TO-OPPORTUNITY | Academic readiness to explainable opportunity matches. |
| OPPORTUNITY-TO-APPLICATION | Opportunity to durable application workspace and private documents. |
| APPLICATION-TO-AUTHORIZED-SUPPORT | Application to authorized support request. |
| AUTHORIZED-SUPPORT-MESSAGING | Support relationship to governed durable messaging. |
| EVENT-TO-ACKNOWLEDGED-NOTIFICATION | Domain events to idempotent notification or outbox journey. |`;
const routes = `| Feature | Route | Rendered file |
| --- | --- | --- |
| Dashboard | \`/dashboard\` | \`app/dashboard/page.tsx\` |`;

describe("Playbook canon journey compiler", () => {
    it("compiles every registered role without converting known gaps into completion claims", () => {
        expect(parsePlaybookRoleJourneys(roles)).toHaveLength(2);
        const result = compilePlaybookUserJourneys(roles, sprints, routes, "abcdef1");
        expect(result).toContain("## Scholar");
        expect(result).toContain("## Employer");
        expect(result).toContain("## High School Counselor");
        expect(result).toContain("## Athlete Abroad enrollment");
        expect(result).toContain("## District / School Administrator");
        expect(result).toContain("MISSING: no canonical signup contract is declared");
        expect(result).toContain("MISSING: no onboarding");
        expect(result).toContain("It is not implementation or acceptance evidence");
        expect(result).toContain("OR-002 — Unified premium onboarding shell");
        expect(result).toContain("Governed source revision: `abcdef1`");
        expect(parseProductAcceptanceJourneys(result).map(item => item.journeyId)).toContain("READINESS-TO-OPPORTUNITY");
        expect(parseProductAcceptanceJourneys(result).map(item => item.journeyId))
            .toEqual(expect.arrayContaining([...PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS]));
    });

    it("fails closed when role or delivery authorities are not parseable", () => {
        expect(() => parsePlaybookRoleJourneys("# Role Registry")).toThrow("no parseable role journeys");
        expect(() => compilePlaybookUserJourneys(roles, "# no sprints", routes, "abcdef1"))
            .toThrow("no ordered delivery journeys");
        expect(() => compilePlaybookUserJourneys(roles, "## Sprint OR-001 — Canonical role registry and routing", routes, "abcdef1"))
            .toThrow("no structured product acceptance journeys");
        const malformed = sprints.replace("TRANSCRIPT-TO-ACADEMIC-READINESS", "Transcript to Academic Readiness");
        expect(() => compilePlaybookUserJourneys(roles, malformed, routes, "abcdef1"))
            .toThrow("invalid product journey ID");
        const duplicate = `${sprints}\n| READINESS-TO-OPPORTUNITY | duplicate row |`;
        expect(() => compilePlaybookUserJourneys(roles, duplicate, routes, "abcdef1"))
            .toThrow("duplicate product journey IDs");
    });

    it("uses the delegated documentation action defined by PBOS authority", async () => {
        const actions: string[] = [];
        const generated = new Map<string, string>();
        const gateway = { inspectRepository: async () => ({ revision: "abcdef1" }),
            readFileAtRevision: async (_reference: unknown, path: string) => path.includes("ROLE_REGISTRY") ? roles
                : path.includes("SPRINT_MAP") ? sprints : routes,
            createBranch: async () => undefined,
            applyChange: async (_reference: unknown, changes: readonly { path: string; content: string }[]) => {
                changes.forEach(change => generated.set(change.path, change.content));
                return changes.map(change => change.path);
            },
            commit: async () => "bcdef12",
            push: async () => undefined, openDraftPullRequest: async () => ({ url: "https://example.test/pr/1", number: 1,
                branch: "agent/test", repository: "sgwalton87/playbook-platform" }) };
        const executor = playbookCanonJourneysExecutor({ gateway: gateway as never, remediation: { start: () => ({ runId: "validation" }) } as never,
            session: { system: { systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform" } } as never,
            authorize: action => { actions.push(action); return { decisionId: action, grantId: "grant", action,
                allowed: true, reason: "authorized", decidedAt: new Date() }; } });
        await executor({ run: { systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
            startingBranch: "main", startingCommit: "abcdef1", runId: "12345678-aaaa-bbbb-cccc-123456789012" } as never,
            mission: { missionId: "048-canon-journeys" } as never, report: () => undefined });
        expect(actions).toContain("UPDATE_DOCUMENTATION");
        expect(actions).not.toContain("MODIFY_DOCUMENTATION");
        const manifest = JSON.parse(generated.get("pbos/readiness/048-canon-journeys.json") ?? "{}");
        expect(manifest.roleCount).toBe(15);
        const journeyIds = manifest.productJourneys?.map((item: { journeyId: string }) => item.journeyId) ?? [];
        expect(journeyIds).toEqual(expect.arrayContaining([...PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS]));
        expect(journeyIds).toContain("READINESS-TO-OPPORTUNITY");
        expect(journeyIds.length).toBeGreaterThan(7);
    });
});
