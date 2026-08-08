import { describe, expect, it } from "vitest";
import { compilePlaybookUserJourneys, parsePlaybookRoleJourneys } from "../playbook-canon-journeys-executor";

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
});
