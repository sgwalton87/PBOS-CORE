import { describe, expect, it } from "vitest";
import { EasCommandRunner, EasPreviewDeploymentGateway, FunctionalAcceptancePlan,
    ProtectedEnvironmentResolver } from "../index";

function plan(): FunctionalAcceptancePlan {
    return { planId: "mobile-store:abcdef1", systemId: "PLAYBOOK-SYSTEM-001",
        productNodeId: "THE-PLAYBOOK-MOBILE", journeyId: "PLAYBOOK-MOBILE-INTERNAL-RELEASE",
        repository: "sgwalton87/playbook-platform", branch: "agent/mobile-store", commit: "abcdef1",
        workingDirectory: "/private/tmp/playbook-store", launch: { command: "npm", args: ["run", "dev"],
            baseUrl: "http://127.0.0.1:4317", healthPath: "/login", startupTimeoutMs: 1 },
        probes: [{ probeId: "login", dimension: "ROUTE", behavior: "Login renders.", path: "/login", expectedStatus: 200 }],
        browserJourneys: [{ journeyId: "scholar", persona: "SCHOLAR", behavior: "Scholar signs in.", route: "/login",
            engine: "PLAYWRIGHT", command: { command: "npm", args: ["test"] },
            viewports: ["DESKTOP_1440X900", "MOBILE_390X844"], screenshotArtifacts: ["desktop.png", "mobile.png"],
            traceArtifact: "trace.zip", accessibilityArtifact: "a11y.json", acceptanceArtifact: "acceptance.json",
            verifiedDimensions: ["AUTHORITY"] }],
        previewDeployment: { provider: "EAS", repository: "sgwalton87/playbook-platform", branch: "agent/mobile-store",
            commit: "abcdef1", environment: "preview", approvalId: "approval", tokenEnvironmentVariable: "EXPO_TOKEN",
            projectEnvironmentVariable: "EXPO_PROJECT_ID", webPreviewEnvironmentVariable: "PBOS_WEB_PREVIEW_URL",
            applicationDirectory: "apps/mobile", cliVersion: "21.3.0", previewProfile: "preview",
            storeProfile: "production", submitProfile: "production", platforms: ["IOS", "ANDROID"],
            distributionTarget: "TESTFLIGHT_AND_PLAY_INTERNAL", browserTarget: "DEPLOYED_PREVIEW" }
    };
}

function builds(kind: "preview" | "store") {
    return JSON.stringify(["IOS", "ANDROID"].map(platform => ({ id: `${kind}-${platform.toLowerCase()}`,
        platform, status: "FINISHED", gitCommitHash: "abcdef1", project: { id: "expo-project" },
        buildDetailsPageUrl: `https://expo.dev/accounts/pbos/projects/playbook/builds/${kind}-${platform.toLowerCase()}` })));
}

describe("EAS exact-revision mobile release deployment", () => {
    it("creates installable previews and internal-store submissions without public release", async () => {
        const calls: string[][] = [];
        let invocation = 0;
        const commands: EasCommandRunner = { run: async (_command, args) => {
            calls.push([...args]);
            return { stdout: invocation++ === 0 ? builds("preview") : builds("store"), stderr: "" };
        } };
        const resolver = new ProtectedEnvironmentResolver({ EXPO_TOKEN: "protected-token",
            EXPO_PROJECT_ID: "expo-project", PBOS_WEB_PREVIEW_URL: "https://playbook-preview.example/login" });

        const preview = await new EasPreviewDeploymentGateway(commands, resolver).deploy(plan());

        expect(preview).toMatchObject({ webUrl: "https://playbook-preview.example/login",
            mobileUrl: "https://expo.dev/accounts/pbos/projects/playbook/builds/preview-android",
            iosUrl: "https://expo.dev/accounts/pbos/projects/playbook/builds/preview-ios",
            androidUrl: "https://expo.dev/accounts/pbos/projects/playbook/builds/preview-android",
            mobileHealthPath: "", providerEvidence: { iosStoreBuildId: "store-ios",
                androidStoreBuildId: "store-android", distributionTarget: "TESTFLIGHT_AND_PLAY_INTERNAL" } });
        expect(calls[0]).toContain("preview");
        expect(calls[1]).toContain("--auto-submit-with-profile");
        expect(calls[1]).toContain("production");
        expect(calls.flat().join(" ")).not.toContain("protected-token");
        expect(calls.flat().join(" ")).not.toContain("--platform production");
    });

    it("rejects provider evidence from a different repository commit", async () => {
        const commands: EasCommandRunner = { run: async () => ({ stdout: builds("preview").replaceAll("abcdef1", "badcafe"), stderr: "" }) };
        const resolver = new ProtectedEnvironmentResolver({ EXPO_TOKEN: "token",
            EXPO_PROJECT_ID: "expo-project", PBOS_WEB_PREVIEW_URL: "https://playbook-preview.example" });
        await expect(new EasPreviewDeploymentGateway(commands, resolver).deploy(plan()))
            .rejects.toThrow("lineage or status is invalid");
    });
});
