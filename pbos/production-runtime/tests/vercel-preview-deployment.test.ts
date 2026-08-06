import { describe, expect, it } from "vitest";
import { FunctionalAcceptancePlan, ProtectedEnvironmentResolver, VercelPreviewDeploymentGateway } from "../index";

function plan(): FunctionalAcceptancePlan {
    return { planId: "web-staging:abcdef1", systemId: "PLAYBOOK-SYSTEM-001", productNodeId: "PLAYBOOK-WEB",
        journeyId: "PLAYBOOK-WEB-STAGING", repository: "sgwalton87/playbook-platform", branch: "agent/web-staging",
        commit: "abcdef1", workingDirectory: "/tmp/playbook", launch: { command: "npm", args: ["run", "dev"],
            baseUrl: "http://127.0.0.1:4317", healthPath: "/login", startupTimeoutMs: 1 },
        probes: [{ probeId: "login", dimension: "ROUTE", behavior: "Login renders.", path: "/login", expectedStatus: 200 }],
        browserJourneys: [{ journeyId: "scholar", persona: "SCHOLAR", behavior: "Scholar signs in.", route: "/login",
            engine: "PLAYWRIGHT", command: { command: "npm", args: ["test"] },
            viewports: ["DESKTOP_1440X900", "MOBILE_390X844"], screenshotArtifacts: ["desktop.png", "mobile.png"],
            traceArtifact: "trace.zip", accessibilityArtifact: "a11y.json", acceptanceArtifact: "acceptance.json",
            verifiedDimensions: ["AUTHORITY"] }],
        previewDeployment: { provider: "VERCEL", repository: "sgwalton87/playbook-platform", branch: "agent/web-staging",
            commit: "abcdef1", environment: "preview", approvalId: "approval", tokenEnvironmentVariable: "VERCEL_TOKEN",
            projectEnvironmentVariable: "VERCEL_PROJECT_ID", teamEnvironmentVariable: "VERCEL_TEAM_ID",
            requiredProjectEnvironmentVariables: ["PBOS_ENVIRONMENT"], previewOnlyEnvironmentVariables: ["PBOS_ENVIRONMENT"],
            browserTarget: "DEPLOYED_PREVIEW" }
    };
}

describe("Vercel exact-revision preview deployment", () => {
    it("validates binding and scopes before returning a READY commit-bound preview", async () => {
        const calls: Array<{ url: string; body?: string }> = [];
        const responses = [
            { id: "prj_1", name: "the-playbook", link: { type: "github", org: "sgwalton87", repo: "playbook-platform", repoId: 77 } },
            { envs: [{ key: "PBOS_ENVIRONMENT", target: ["preview"] }] },
            { id: "dpl_1", url: "the-playbook-preview.vercel.app", readyState: "BUILDING" },
            { id: "dpl_1", url: "the-playbook-preview.vercel.app", readyState: "READY", target: null,
                meta: { githubCommitSha: "abcdef1" } }
        ];
        const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
            calls.push({ url: String(url), body: typeof init?.body === "string" ? init.body : undefined });
            return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "content-type": "application/json" } });
        }) as typeof fetch;
        const resolver = new ProtectedEnvironmentResolver({ VERCEL_TOKEN: "secret", VERCEL_PROJECT_ID: "prj_1", VERCEL_TEAM_ID: "team_1" });
        const preview = await new VercelPreviewDeploymentGateway(fetcher, resolver, async () => undefined, 2).deploy(plan());
        expect(preview).toEqual({ webUrl: "https://the-playbook-preview.vercel.app",
            mobileUrl: "https://the-playbook-preview.vercel.app", healthPath: "/login", label: "SEEDED" });
        expect(calls[2].url).toContain("/v13/deployments?teamId=team_1&forceNew=1");
        expect(JSON.parse(calls[2].body ?? "{}").gitSource).toMatchObject({ repoId: 77, sha: "abcdef1" });
        expect(calls.map(call => call.body ?? "").join(" ")).not.toContain("secret");
    });

    it("rejects staging-only configuration names that are also scoped to production", async () => {
        const responses = [
            { id: "prj_1", name: "the-playbook", link: { type: "github", org: "sgwalton87", repo: "playbook-platform", repoId: 77 } },
            { envs: [{ key: "PBOS_ENVIRONMENT", target: ["preview", "production"] }] }
        ];
        const fetcher = (async () => new Response(JSON.stringify(responses.shift()), { status: 200 })) as typeof fetch;
        const resolver = new ProtectedEnvironmentResolver({ VERCEL_TOKEN: "secret", VERCEL_PROJECT_ID: "prj_1", VERCEL_TEAM_ID: "team_1" });
        await expect(new VercelPreviewDeploymentGateway(fetcher, resolver).deploy(plan()))
            .rejects.toThrow("shares one staging credential entry with production");
    });
});
