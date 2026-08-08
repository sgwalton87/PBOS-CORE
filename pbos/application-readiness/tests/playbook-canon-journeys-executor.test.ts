import { describe, expect, it } from "vitest";
import { compilePlaybookUserJourneys, parsePlaybookRoleJourneys,
    playbookCanonJourneysExecutor } from "../playbook-canon-journeys-executor";

const roles = `# Role Registry
| Role | Signup | Onboarding | OS Route | Dashboard | Permissions | Record Type | Playbook Record | Scholar Record | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Scholar | VERIFIED: scholar. | VERIFIED: role onboarding. | VERIFIED: /dashboard. | VERIFIED: app/dashboard/page.tsx. | VERIFIED: scholar permissions. | VERIFIED: scholar. | PARTIAL: record projection missing. | PARTIAL: Scholar Record missing. | PARTIAL: email only. | PARTIAL |
| Employer | VERIFIED: employer. | MISSING: no onboarding. | PARTIAL: /employer-os. | VERIFIED: app/employer-os/page.tsx. | VERIFIED: employer permissions. | PARTIAL: organization. | MISSING: no record. | MISSING: candidate link. | MISSING: verification. | MISSING |`;
const sprints = `## Sprint OR-001 — Canonical role registry and routing
## Sprint OR-002 — Unified premium onboarding shell`;
const routes = `| Feature | Route | Rendered file |
| --- | --- | --- |
| Dashboard | \`/dashboard\` | \`app/dashboard/page.tsx\` |`;

describe("Playbook canon journey compiler", () => {
    it("compiles every registered role without converting known gaps into completion claims", () => {
        expect(parsePlaybookRoleJourneys(roles)).toHaveLength(2);
        const result = compilePlaybookUserJourneys(roles, sprints, routes, "abcdef1");
        expect(result).toContain("## Scholar");
        expect(result).toContain("## Employer");
        expect(result).toContain("MISSING: no onboarding");
        expect(result).toContain("It is not implementation or acceptance evidence");
        expect(result).toContain("OR-002 — Unified premium onboarding shell");
        expect(result).toContain("Governed source revision: `abcdef1`");
    });

    it("fails closed when role or delivery authorities are not parseable", () => {
        expect(() => parsePlaybookRoleJourneys("# Role Registry")).toThrow("no parseable role journeys");
        expect(() => compilePlaybookUserJourneys(roles, "# no sprints", routes, "abcdef1"))
            .toThrow("no ordered delivery journeys");
    });

    it("uses the delegated documentation action defined by PBOS authority", async () => {
        const actions: string[] = [];
        const gateway = { inspectRepository: async () => ({ revision: "abcdef1" }),
            readFileAtRevision: async (_reference: unknown, path: string) => path.includes("ROLE_REGISTRY") ? roles
                : path.includes("SPRINT_MAP") ? sprints : routes,
            createBranch: async () => undefined, applyChange: async () => undefined, commit: async () => "bcdef12",
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
    });
});
