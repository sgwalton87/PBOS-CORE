import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { ApplicationLauncher, BrowserJourneyRuntime, CommandBrowserJourneyRuntime, CommandNativeJourneyRuntime, FunctionalAcceptancePlan, FunctionalApplicationRuntime,
    resolveFunctionalPrerequisites, RuntimeProbeRunner, verifyVisualCanonContract } from "../index";

function repository(): Readonly<{ path: string; revision: string }> {
    const path = mkdtempSync(join(tmpdir(), "pbos-functional-app-"));
    execFileSync("git", ["init", "-q"], { cwd: path });
    writeFileSync(join(path, "package.json"), JSON.stringify({
        name: "pbos-functional-application-fixture", version: "1.0.0", scripts: { dev: "node server.js" }
    }));
    writeFileSync(join(path, "package-lock.json"), JSON.stringify({
        name: "pbos-functional-application-fixture", version: "1.0.0", lockfileVersion: 3,
        requires: true, packages: { "": { name: "pbos-functional-application-fixture", version: "1.0.0" } }
    }));
    writeFileSync(join(path, "server.js"), "process.exit(0);\n");
    execFileSync("git", ["add", "package.json", "package-lock.json", "server.js"], { cwd: path });
    execFileSync("git", ["-c", "user.name=PBOS", "-c", "user.email=pbos@example.invalid", "commit", "-m", "fixture", "-q"], { cwd: path });
    return { path, revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: path, encoding: "utf8" }).trim() };
}

function plan(path: string, revision: string): FunctionalAcceptancePlan {
    return { planId: "plan-1", systemId: "PLAYBOOK-SYSTEM-001", productNodeId: "PLAYBOOK-SCHOLAR-ONBOARDING",
        journeyId: "SCHOLAR-ONBOARDING-TO-DASHBOARD", repository: "sgwalton87/playbook-platform",
        branch: "agent/acceptance", commit: revision, workingDirectory: path,
        launch: { command: "npm", args: ["run", "dev"], baseUrl: "http://127.0.0.1:4311", healthPath: "/healthz", startupTimeoutMs: 5_000 },
        probes: [
            { probeId: "route", dimension: "ROUTE", behavior: "The Scholar route responds.", path: "/start", expectedStatus: 200 },
            { probeId: "data", dimension: "DURABLE_DATA", behavior: "The Scholar record survives reload.", path: "/api/acceptance/data", expectedStatus: 200 },
            { probeId: "authority", dimension: "AUTHORITY", behavior: "Cross-owner access is denied.", path: "/api/acceptance/authority", expectedStatus: 403 },
            { probeId: "pbos", dimension: "PBOS_INTEGRATION", behavior: "PBOS provenance is returned.", path: "/api/acceptance/pbos", expectedStatus: 200 },
            { probeId: "security", dimension: "SECURITY", behavior: "Anonymous mutation is denied.", path: "/api/acceptance/security", expectedStatus: 401 }
        ],
        browserJourneys: [{ journeyId: "scholar", persona: "SCHOLAR", behavior: "A Scholar completes onboarding and sees the dashboard.",
            route: "/start", engine: "PLAYWRIGHT", command: { command: "npx", args: ["playwright", "test"] },
            viewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
            screenshotArtifacts: ["artifacts/scholar-desktop.png", "artifacts/scholar-mobile.png"], traceArtifact: "artifacts/scholar.zip",
            accessibilityArtifact: "artifacts/scholar-a11y.json", acceptanceArtifact: "artifacts/scholar-acceptance.json",
            verifiedDimensions: ["DURABLE_DATA", "PBOS_INTEGRATION"] }] };
}

function canonicalJourney(path: string): Readonly<{
    acceptance: FunctionalAcceptancePlan;
    journey: FunctionalAcceptancePlan["browserJourneys"][number];
    assetPath: string;
    manifestPath: string;
}> {
    const acceptance = plan(path, "abcdef1");
    const assetPath = "public/brand/scholar-dashboard/hero.png";
    const manifestPath = "docs/design/canon/scholar-dashboard/manifest.json";
    mkdirSync(join(path, "public/brand/scholar-dashboard"), { recursive: true });
    mkdirSync(join(path, "docs/design/canon/scholar-dashboard"), { recursive: true });
    const content = "approved Scholar visual";
    writeFileSync(join(path, assetPath), content);
    writeFileSync(join(path, manifestPath), JSON.stringify({ schemaVersion: 1, screenId: "PGSL-007",
        route: "/dashboard", authority: "USER_APPROVED_CANON_REFERENCE",
        assets: [{ path: assetPath, sha256: createHash("sha256").update(content).digest("hex"), required: true }] }));
    const journey = { ...acceptance.browserJourneys[0], visualCanon: { screenId: "PGSL-007", manifestPath,
        requiredRoute: "/dashboard", requiredAssets: [assetPath] } };
    return { acceptance, journey, assetPath, manifestPath };
}

describe("PBS-5000 functional application runtime", () => {
    it("derives functional evidence from an exact-revision runtime and browser journey", async () => {
        const repo = repository(); let stopped = false; const telemetry: string[] = [];
        const launcher: ApplicationLauncher = { launch: async () => ({ logs: () => "ready", stop: async () => { stopped = true; } }) };
        const probes: RuntimeProbeRunner = { run: async (_plan, probe) => ({ probe, status: probe.expectedStatus,
            responseExcerpt: "ok", durationMs: 1, passed: true }) };
        const browser: BrowserJourneyRuntime = { run: async (_plan, journey) => ({ journey, durationMs: 2,
            artifacts: [...journey.screenshotArtifacts, journey.traceArtifact, journey.accessibilityArtifact, journey.acceptanceArtifact],
            verifiedDimensions: journey.verifiedDimensions, passed: true }) };
        const result = await new FunctionalApplicationRuntime(launcher, probes, browser, undefined,
            async () => 2 * 1024 * 1024 * 1024)
            .execute("run-1", plan(repo.path, repo.revision), event => telemetry.push(event));
        expect(stopped).toBe(true);
        expect(new Set(result.evidence.map(item => item.dimension))).toEqual(new Set([
            "ROUTE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION", "SECURITY",
            "USER_INTERFACE", "ACCEPTANCE_TEST", "ACCESSIBILITY"
        ]));
        expect(result.preview).toMatchObject({ status: "REQUESTED", commit: repo.revision, label: "SIMULATED" });
        expect(result.preview.webUrl).toBeUndefined();
        expect(telemetry).toEqual(["PREREQUISITES_VERIFIED", "APPLICATION_HEALTHY", "RUNTIME_PROBES_VERIFIED", "BROWSER_JOURNEYS_VERIFIED"]);
    });

    it("executes deployed-preview acceptance without launching a competing local application", async () => {
        const repo = repository(); let launched = false; let browserBaseUrl = "";
        const previewUrl = "https://the-playbook-preview.example.com";
        const acceptance: FunctionalAcceptancePlan = { ...plan(repo.path, repo.revision),
            launch: { ...plan(repo.path, repo.revision).launch, baseUrl: previewUrl },
            previewDeployment: { provider: "VERCEL", repository: "sgwalton87/playbook-platform",
                branch: "agent/acceptance", commit: repo.revision, environment: "preview", approvalId: "approval",
                tokenEnvironmentVariable: "VERCEL_TOKEN", projectEnvironmentVariable: "VERCEL_PROJECT_ID",
                requiredProjectEnvironmentVariables: [], previewOnlyEnvironmentVariables: [],
                browserTarget: "DEPLOYED_PREVIEW" },
            durablePreview: { webUrl: previewUrl, mobileUrl: previewUrl, healthPath: "/login", label: "LIVE" } };
        const runtime = new FunctionalApplicationRuntime({ launch: async () => {
            launched = true; throw new Error("local launch must not run");
        } }, { run: async (_plan, probe) => ({ probe, status: probe.expectedStatus, responseExcerpt: "ok",
            durationMs: 1, passed: true }) }, { run: async (actual, journey) => {
            browserBaseUrl = actual.launch.baseUrl;
            return { journey, durationMs: 1, artifacts: [], verifiedDimensions: journey.verifiedDimensions, passed: true };
        } }, undefined, async () => 2 * 1024 * 1024 * 1024);
        (runtime as unknown as { verifyDurablePreview: () => Promise<FunctionalAcceptancePlan["durablePreview"]> })
            .verifyDurablePreview = async () => acceptance.durablePreview;

        await runtime.execute("preview-run", acceptance);

        expect(launched).toBe(false);
        expect(browserBaseUrl).toBe(previewUrl);
    });

    it("refuses to launch when the checked-out application revision differs from the plan", async () => {
        const repo = repository();
        const runtime = new FunctionalApplicationRuntime({ launch: async () => { throw new Error("must not launch"); } },
            {} as RuntimeProbeRunner, {} as BrowserJourneyRuntime);
        await expect(runtime.execute("run-1", plan(repo.path, "abcdef1"))).rejects.toThrow("lineage mismatch");
    });

    it("preserves the production disk safety gate without depending on host disk capacity", async () => {
        const repo = repository();
        const runtime = new FunctionalApplicationRuntime({ launch: async () => { throw new Error("must not launch"); } },
            {} as RuntimeProbeRunner, {} as BrowserJourneyRuntime, undefined, async () => 128 * 1024 * 1024);
        await expect(runtime.execute("run-1", plan(repo.path, repo.revision)))
            .rejects.toThrow("requires 1073741824 free bytes but only 134217728 are available");
    });

    it("reserves build headroom before a reproducible dependency bootstrap", async () => {
        const repo = repository();
        const runtime = new FunctionalApplicationRuntime({ launch: async () => { throw new Error("must not launch"); } },
            {} as RuntimeProbeRunner, {} as BrowserJourneyRuntime, undefined,
            async () => 1536 * 1024 * 1024);
        await expect(runtime.execute("run-build-headroom", plan(repo.path, repo.revision)))
            .rejects.toThrow("dependency preparation requires 2147483648 free bytes");
    });

    it("rechecks the disk safety reserve after dependency preparation", async () => {
        const repo = repository();
        const acceptance = { ...plan(repo.path, repo.revision), launch: { ...plan(repo.path, repo.revision).launch,
            command: process.execPath, args: ["server.js"] } };
        const observations = [2 * 1024 * 1024 * 1024, 128 * 1024 * 1024];
        const runtime = new FunctionalApplicationRuntime({ launch: async () => { throw new Error("must not launch"); } },
            {} as RuntimeProbeRunner, {} as BrowserJourneyRuntime, undefined,
            async () => observations.shift() ?? 128 * 1024 * 1024);
        await expect(runtime.execute("run-disk-reserve", acceptance))
            .rejects.toThrow("exhausted its disk safety reserve during dependency preparation");
    });

    it("recovers a historical Node acceptance plan by deriving npm ci from its committed lockfile", async () => {
        const repo = repository();
        writeFileSync(join(repo.path, "package.json"), JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "1.0.0" } }));
        writeFileSync(join(repo.path, "package-lock.json"), JSON.stringify({ lockfileVersion: 3 }));
        const prerequisites = await resolveFunctionalPrerequisites(plan(repo.path, repo.revision));
        expect(prerequisites[0]).toMatchObject({ command: "npm", args: ["ci", "--no-audit", "--no-fund"],
            timeoutMs: 900_000 });
    });

    it("normalizes durable npm acceptance plans to deterministic non-auditing installs", async () => {
        const repo = repository();
        const acceptance = { ...plan(repo.path, repo.revision),
            prerequisites: [{ command: "npm", args: ["ci"], timeoutMs: 300_000 }] };
        const prerequisites = await resolveFunctionalPrerequisites(acceptance);
        expect(prerequisites).toEqual([
            { command: "npm", args: ["ci", "--no-audit", "--no-fund"], timeoutMs: 900_000 }
        ]);
    });

    it("accepts browser claims only when a commit-bound acceptance report proves every declared dimension", async () => {
        const repo = repository(); const acceptance = plan(repo.path, repo.revision); const journey = acceptance.browserJourneys[0];
        mkdirSync(join(repo.path, "artifacts"), { recursive: true });
        [...journey.screenshotArtifacts, journey.traceArtifact, journey.accessibilityArtifact]
            .forEach(path => writeFileSync(join(repo.path, path), "evidence"));
        writeFileSync(join(repo.path, journey.acceptanceArtifact), JSON.stringify({ schemaVersion: 1,
            journeyId: journey.journeyId, commit: repo.revision,
            checks: journey.verifiedDimensions.map(dimension => ({ dimension, passed: true, detail: `${dimension} verified` })) }));
        const observed = await new CommandBrowserJourneyRuntime().run(acceptance, {
            ...journey, command: { command: process.execPath, args: ["-e", "process.exit(0)"] }
        });
        expect(observed.verifiedDimensions).toEqual(["DURABLE_DATA", "PBOS_INTEGRATION"]);
        writeFileSync(join(repo.path, journey.acceptanceArtifact), JSON.stringify({ schemaVersion: 1,
            journeyId: journey.journeyId, commit: "badcafe", checks: [] }));
        await expect(new CommandBrowserJourneyRuntime().run(acceptance, {
            ...journey, command: { command: process.execPath, args: ["-e", "process.exit(0)"] }
        })).rejects.toThrow("acceptance report is invalid");
    });

    it("reports actionable browser command failures without exposing protected values", async () => {
        const repo = repository(); const acceptance = plan(repo.path, repo.revision);
        const journey = { ...acceptance.browserJourneys[0],
            command: { command: process.execPath,
                args: ["-e", "console.error('PASSWORD=do-not-log'); process.exit(2)"],
                requiredEnvironmentVariables: ["PASSWORD"] } };
        await expect(new CommandBrowserJourneyRuntime().run(acceptance, journey, { PASSWORD: "do-not-log" }))
            .rejects.toThrowError(expect.objectContaining({
                message: expect.stringContaining("Browser journey command failed")
            }));
        try {
            await new CommandBrowserJourneyRuntime().run(acceptance, journey, { PASSWORD: "do-not-log" });
        } catch (error) {
            expect(String(error)).toContain("PASSWORD=[REDACTED]");
            expect(String(error)).not.toContain("do-not-log");
        }
    });

    it("terminates a browser command at its declared bounded timeout", async () => {
        const repo = repository(); const acceptance = plan(repo.path, repo.revision);
        const journey = { ...acceptance.browserJourneys[0], command: { command: process.execPath,
            args: ["-e", "setInterval(() => undefined, 1000)"], timeoutMs: 50 } };
        const startedAt = Date.now();
        await expect(new CommandBrowserJourneyRuntime().run(acceptance, journey))
            .rejects.toThrow("timed out after 50ms");
        expect(Date.now() - startedAt).toBeLessThan(2_000);
    });

    it("attaches redacted application logs when a browser journey exposes a server-side failure", async () => {
        const repo = repository(); const acceptance = plan(repo.path, repo.revision);
        const environmentPath = join(repo.path, ".acceptance.env");
        writeFileSync(environmentPath, "PASSWORD=do-not-log\n");
        chmodSync(environmentPath, 0o600);
        const governed = { ...acceptance, protectedEnvironmentFiles: [{ path: environmentPath }],
            browserJourneys: acceptance.browserJourneys.map(journey => ({ ...journey,
                command: { ...journey.command, requiredEnvironmentVariables: ["PASSWORD"] } })) };
        const launcher: ApplicationLauncher = { launch: async () => ({
            logs: () => "POST /api/example 500 PASSWORD=do-not-log Authorization: Bearer another-secret",
            stop: async () => undefined
        }) };
        const probes: RuntimeProbeRunner = { run: async (_plan, probe) => ({ probe, status: probe.expectedStatus,
            responseExcerpt: "ok", durationMs: 1, passed: true }) };
        const browser: BrowserJourneyRuntime = { run: async () => { throw new Error("browser received HTTP 500"); } };
        await expect(new FunctionalApplicationRuntime(launcher, probes, browser, undefined,
            async () => 2 * 1024 * 1024 * 1024).execute("run-logs", governed))
            .rejects.toThrow("Redacted application logs:\nPOST /api/example 500 PASSWORD=[REDACTED] authorization: Bearer [REDACTED]");
    });

    it("accepts native claims only when both platforms produce exact-revision evidence", async () => {
        const repo = repository(); const acceptance = plan(repo.path, repo.revision);
        const artifact = "artifacts/native/platform-builds.json";
        const acceptanceArtifact = "artifacts/native/acceptance.json";
        mkdirSync(join(repo.path, "artifacts/native"), { recursive: true });
        writeFileSync(join(repo.path, artifact), JSON.stringify({ ios: "EXPORTED", android: "EXPORTED" }));
        writeFileSync(join(repo.path, acceptanceArtifact), JSON.stringify({ schemaVersion: 1,
            journeyId: "mobile-scholar", commit: repo.revision, platforms: ["IOS", "ANDROID"],
            checks: [{ dimension: "AUTHORITY", passed: true, detail: "Secure native session boundary passed." }] }));
        const journey = { journeyId: "mobile-scholar", behavior: "Scholar journeys execute natively.",
            platforms: ["IOS", "ANDROID"] as const,
            command: { command: process.execPath, args: ["-e", "process.exit(0)"] },
            artifacts: [artifact], acceptanceArtifact, verifiedDimensions: ["AUTHORITY"] as const };
        const observed = await new CommandNativeJourneyRuntime().run({ ...acceptance, nativeJourneys: [journey] }, journey);
        expect(observed.passed).toBe(true);
        expect(observed.journey.platforms).toEqual(["IOS", "ANDROID"]);

        writeFileSync(join(repo.path, acceptanceArtifact), JSON.stringify({ schemaVersion: 1,
            journeyId: "mobile-scholar", commit: repo.revision, platforms: ["IOS"], checks: [] }));
        await expect(new CommandNativeJourneyRuntime().run({ ...acceptance, nativeJourneys: [journey] }, journey))
            .rejects.toThrow("ANDROID");
    });

    it("accepts a user-approved visual canon only when every required asset is nonempty and hash-bound", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-visual-canon-"));
        const fixture = canonicalJourney(root);
        await expect(verifyVisualCanonContract(fixture.acceptance, fixture.journey)).resolves.toBeUndefined();
    });

    it("rejects visual canon drift and empty design placeholders", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-visual-canon-"));
        const fixture = canonicalJourney(root);
        writeFileSync(join(root, fixture.assetPath), "");
        await expect(verifyVisualCanonContract(fixture.acceptance, fixture.journey)).rejects.toThrow("missing or empty");
        writeFileSync(join(root, fixture.assetPath), "changed without approval");
        await expect(verifyVisualCanonContract(fixture.acceptance, fixture.journey)).rejects.toThrow("digest does not match");
    });

    it("rejects visual canon paths that escape the governed repository", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-visual-canon-"));
        const fixture = canonicalJourney(root);
        const journey = { ...fixture.journey,
            visualCanon: { ...fixture.journey.visualCanon!, manifestPath: "../outside-manifest.json" } };
        await expect(verifyVisualCanonContract(fixture.acceptance, journey)).rejects.toThrow("must remain inside");
    });
});
