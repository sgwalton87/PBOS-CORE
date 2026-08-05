import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { createBulletproofBlueprint, createPlaybookBlueprint } from "../../reference-systems";
import {
    EducationRemediationPack, LegacyPlanningRemediationPack, NextJsRemediationPack, NodeDependencyRemediationPack,
    ProjectRemediationProfileRegistry, RemediationPackRegistry, SupabaseRemediationPack,
    UniversalRemediationHandler
} from "../index";

const failedRun = (systemId: string, repository: string, log: string) => ({
    runId: "run", systemId, pullRequest: { repository, number: 1, branch: "agent/build", url: `https://github.com/${repository}/pull/1` },
    headSha: "sha", attempt: 0, maximumAttempts: 5, state: "REMEDIATION_REQUIRED" as const,
    evidence: [{ evidenceId: "evidence", name: "CI", state: "FAILED" as const, failureLog: log, collectedAt: new Date().toISOString() }],
    blockers: [], updatedAt: new Date().toISOString()
});
const createNewBlueprint = () => ({ ...createBulletproofBlueprint(), application: { strategy: "CREATE_NEW" as const } });

describe("universal remediation pack registry", () => {
    function configured() {
        const packs = new RemediationPackRegistry();
        [new NodeDependencyRemediationPack(), new NextJsRemediationPack(), new SupabaseRemediationPack(), new LegacyPlanningRemediationPack(), new EducationRemediationPack()]
            .forEach(pack => packs.register(pack));
        const projects = new ProjectRemediationProfileRegistry();
        return { packs, projects };
    }

    it("lets a second project reuse stack packs without a project handler class", async () => {
        const { packs, projects } = configured();
        projects.register({ systemId: "SECOND-SYSTEM-001", repository: "example/second-app",
            remediationPackIds: ["@pbos/remediation-node-dependencies", "@pbos/remediation-nextjs"], createBlueprint: createNewBlueprint });
        const handler = new UniversalRemediationHandler({} as GitHubRepositoryGateway, packs, projects);
        const changes = await handler.propose(failedRun("SECOND-SYSTEM-001", "example/second-app", "next build: couldn't find any `pages` or `app` directory"));
        expect(changes?.files.map(file => file.path)).toContain("src/app/page.tsx");
        expect(changes?.files.map(file => file.path)).not.toContain("src/domain/legacy/vertical-slice.ts");
    });

    it("provides a scoped education remediation without replacing Playbook manifests", async () => {
        const { packs, projects } = configured();
        projects.register({ systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
            remediationPackIds: ["@pbos/remediation-education"], createBlueprint: createPlaybookBlueprint });
        const changes = await new UniversalRemediationHandler({} as GitHubRepositoryGateway, packs, projects)
            .propose(failedRun("PLAYBOOK-SYSTEM-001", "sgwalton87/playbook-platform", "Scholar onboarding requires identity approval"));
        const paths = changes?.files.map(file => file.path) ?? [];
        expect(paths).toContain("pbos/generated/domain/education/scholar-journey.ts");
        expect(paths).not.toContain("package.json");
        expect(paths).not.toContain("tsconfig.json");
    });

    it("selects dependency remediation independently from domain behavior", async () => {
        const { packs, projects } = configured();
        projects.register({ systemId: "APP-001", repository: "example/app", remediationPackIds: ["@pbos/remediation-node-dependencies"], createBlueprint: createBulletproofBlueprint });
        const changes = await new UniversalRemediationHandler({} as GitHubRepositoryGateway, packs, projects)
            .propose(failedRun("APP-001", "example/app", "npm ci requires package-lock.json"));
        expect(changes?.prepareDependencyLock).toBe(true);
        expect(changes?.files).toEqual([]);
    });

    it("returns no deterministic remediation when a matching pack produces no scoped files", async () => {
        const { packs, projects } = configured();
        projects.register({ systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
            remediationPackIds: ["@pbos/remediation-nextjs"], createBlueprint: createPlaybookBlueprint });
        const changes = await new UniversalRemediationHandler({} as GitHubRepositoryGateway, packs, projects)
            .propose(failedRun("PLAYBOOK-SYSTEM-001", "sgwalton87/playbook-platform", "npm run typecheck failed"));
        expect(changes).toBeUndefined();
    });

    it("refuses unregistered projects and unknown packs", async () => {
        const { packs, projects } = configured();
        const handler = new UniversalRemediationHandler({} as GitHubRepositoryGateway, packs, projects);
        expect(await handler.propose(failedRun("UNKNOWN", "example/app", "next build failed"))).toBeUndefined();
        projects.register({ systemId: "BROKEN", repository: "example/app", remediationPackIds: ["missing-pack"], createBlueprint: createBulletproofBlueprint });
        await expect(handler.propose(failedRun("BROKEN", "example/app", "build failed"))).rejects.toThrow("unknown remediation pack");
    });
});
