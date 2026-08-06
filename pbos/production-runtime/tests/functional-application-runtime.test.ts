import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { ApplicationLauncher, BrowserJourneyRuntime, CommandBrowserJourneyRuntime, FunctionalAcceptancePlan, FunctionalApplicationRuntime,
    resolveFunctionalPrerequisites, RuntimeProbeRunner } from "../index";

function repository(): Readonly<{ path: string; revision: string }> {
    const path = mkdtempSync(join(tmpdir(), "pbos-functional-app-"));
    execFileSync("git", ["init", "-q"], { cwd: path });
    execFileSync("git", ["-c", "user.name=PBOS", "-c", "user.email=pbos@example.invalid", "commit", "--allow-empty", "-m", "fixture", "-q"], { cwd: path });
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

describe("PBS-5000 functional application runtime", () => {
    it("derives functional evidence from an exact-revision runtime and browser journey", async () => {
        const repo = repository(); let stopped = false; const telemetry: string[] = [];
        const launcher: ApplicationLauncher = { launch: async () => ({ logs: () => "ready", stop: async () => { stopped = true; } }) };
        const probes: RuntimeProbeRunner = { run: async (_plan, probe) => ({ probe, status: probe.expectedStatus,
            responseExcerpt: "ok", durationMs: 1, passed: true }) };
        const browser: BrowserJourneyRuntime = { run: async (_plan, journey) => ({ journey, durationMs: 2,
            artifacts: [...journey.screenshotArtifacts, journey.traceArtifact, journey.accessibilityArtifact, journey.acceptanceArtifact],
            verifiedDimensions: journey.verifiedDimensions, passed: true }) };
        const result = await new FunctionalApplicationRuntime(launcher, probes, browser)
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

    it("refuses to launch when the checked-out application revision differs from the plan", async () => {
        const repo = repository();
        const runtime = new FunctionalApplicationRuntime({ launch: async () => { throw new Error("must not launch"); } },
            {} as RuntimeProbeRunner, {} as BrowserJourneyRuntime);
        await expect(runtime.execute("run-1", plan(repo.path, "abcdef1"))).rejects.toThrow("lineage mismatch");
    });

    it("recovers a historical Node acceptance plan by deriving npm ci from its committed lockfile", async () => {
        const repo = repository();
        writeFileSync(join(repo.path, "package.json"), JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "1.0.0" } }));
        writeFileSync(join(repo.path, "package-lock.json"), JSON.stringify({ lockfileVersion: 3 }));
        const prerequisites = await resolveFunctionalPrerequisites(plan(repo.path, repo.revision));
        expect(prerequisites[0]).toMatchObject({ command: "npm", args: ["ci"] });
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
});
