import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApplicationAcceptanceDimension } from "../../production-runtime";
import { CanonPhaseImplementationAgent, CodexCanonPhaseImplementationAgent,
    playbookCanonPhaseExecutor } from "../playbook-canon-phase-executor";

const dimensions: readonly ApplicationAcceptanceDimension[] = ["ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY",
    "PBOS_INTEGRATION", "ACCEPTANCE_TEST", "ACCESSIBILITY", "SECURITY"];
const checklistBefore = `# Phase 1 — Identity & Authentication\n\n**Completion:** 41%\n\n- 🟦 Google Login\n- 🟨 Hostinger Email\n\n# Phase 2 — Onboarding\n`;

async function workspace(completionClaim = true): Promise<{ directory: string; agent: CanonPhaseImplementationAgent }> {
    const directory = await mkdtemp(join(tmpdir(), "pbos-phase-test-"));
    const agent: CanonPhaseImplementationAgent = { execute: async request => {
        await mkdir(join(directory, "pbos/readiness"), { recursive: true });
        await mkdir(join(directory, "tests/acceptance"), { recursive: true });
        await mkdir(join(directory, "docs"), { recursive: true });
        await writeFile(join(directory, "evidence.txt"), "executed evidence\n", "utf8");
        await writeFile(join(directory, "tests/acceptance/phase.spec.ts"), "// executable browser acceptance\n", "utf8");
        await writeFile(join(directory, "docs/MASTER_CHECKLIST.md"), checklistBefore.replace("🟦 Google Login", "🟩 Google Login"), "utf8");
        await writeFile(join(directory, request.manifestPath), `${JSON.stringify({ schemaVersion: 1,
            missionId: request.missionId, completionClaim, completedItems: completionClaim ? ["Google Login"] : [],
            remainingItems: ["Hostinger Email"], routes: ["/login"], browserSpec: "tests/acceptance/phase.spec.ts",
            acceptance: dimensions.map(dimension => ({ dimension, behavior: `${dimension} implemented`,
                artifact: "evidence.txt", source: "IMPLEMENTATION" })),
            blockers: completionClaim ? [] : ["Google OAuth is not functional"] }, null, 2)}\n`, "utf8");
        return { summary: completionClaim ? "phase implemented" : "phase blocked" };
    } };
    return { directory, agent };
}

function dependencies(directory: string, agent: CanonPhaseImplementationAgent) {
    const actions: string[] = [];
    const gateway = {
        inspectRepository: async () => ({ revision: "abcdef1" }), readFileAtRevision: async () => checklistBefore,
        createBranch: async () => undefined,
        workingDirectory: async () => directory, commit: async () => "bcdef12", push: async () => undefined,
        openDraftPullRequest: async () => ({ url: "https://example.test/pr/8", number: 8,
            branch: "agent/phase", repository: "sgwalton87/playbook-platform" })
    };
    const commands = { run: async () => ({ stdout: " M docs/MASTER_CHECKLIST.md\n M evidence.txt\n M next-env.d.ts\n?? .vercel/project.json\n?? artifacts/playwright/local.json\n?? tests/acceptance/phase.spec.ts\n?? pbos/readiness/048-phase-01.json\n",
        stderr: "" }) };
    return { actions, dependencies: { gateway: gateway as never, commands, agent,
        remediation: { start: () => ({ runId: "validation-1" }) } as never,
        session: { system: { systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform" } } as never,
        authorize: (action: string) => { actions.push(action); return { allowed: true, reason: "authorized" } as never; } } };
}

const context = { run: { systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
    startingBranch: "main", startingCommit: "abcdef1", runId: "12345678-aaaa-bbbb-cccc-123456789012" },
mission: { missionId: "048-phase-01", title: "Complete Identity & Authentication from Playbook canon",
    rationale: "Identity is incomplete." }, report: () => undefined };

describe("Playbook canon phase execution adapter", () => {
    it("publishes a bounded implementation with an exact-revision desktop/mobile acceptance plan", async () => {
        const target = await workspace();
        const setup = dependencies(target.directory, target.agent);
        const result = await playbookCanonPhaseExecutor(setup.dependencies as never)(context as never);
        expect(setup.actions).toEqual(expect.arrayContaining(["MODIFY_APPLICATION_CODE", "CREATE_TESTS", "CREATE_COMMIT", "PUSH_BRANCH"]));
        expect(result.outputs).toMatchObject({ revision: "bcdef12" });
        expect(result.files?.modified).not.toEqual(expect.arrayContaining(["next-env.d.ts", ".vercel/project.json",
            "artifacts/playwright/local.json"]));
        expect(result.acceptanceEvidence).toHaveLength(8);
        expect(result.functionalAcceptancePlan).toMatchObject({ commit: "bcdef12",
            browserJourneys: [{ engine: "PLAYWRIGHT", viewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
                verifiedDimensions: ["ROUTE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION", "SECURITY"] }] });
    });

    it("refuses to publish a worker result that truthfully reports remaining blockers", async () => {
        const target = await workspace(false);
        const setup = dependencies(target.directory, target.agent);
        await expect(playbookCanonPhaseExecutor(setup.dependencies as never)(context as never))
            .rejects.toThrow("Google OAuth is not functional");
    });

    it("invokes the implementation worker without granting commit, push, merge, or deployment authority", async () => {
        const calls: { command: string; args: readonly string[]; cwd?: string }[] = [];
        const agent = new CodexCanonPhaseImplementationAgent({ run: async (command, args, cwd) => {
            calls.push({ command, args, cwd }); return { stdout: "bounded result", stderr: "" };
        } });
        await agent.execute({ missionId: "048-phase-01", title: "Identity", rationale: "incomplete",
            repository: "sgwalton87/playbook-platform", revision: "abcdef1", workingDirectory: "/tmp/playbook",
            manifestPath: "pbos/readiness/048-phase-01.json" });
        expect(calls[0]?.command).toBe("codex");
        expect(calls[0]?.args).toEqual(expect.arrayContaining(["exec", "--ephemeral", "--sandbox", "workspace-write"]));
        expect(calls[0]?.args).toEqual(expect.arrayContaining(["--config", 'approval_policy="never"']));
        const prompt = calls[0]?.args.at(-1) ?? "";
        expect(prompt).toContain("Do not commit, push, open a PR, merge, or deploy");
        expect(prompt).toContain("PBOS_ACCEPTANCE_COMMIT");
    });
});
