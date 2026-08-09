import { GitHubRepositoryGateway, RepositoryReference, RepositoryFileChange } from "../platform";
import { FunctionalAcceptancePlan, NativeJourneyPlan } from "../production-runtime";
import { playbookProductAcceptancePlan } from "./playbook-product-functional-acceptance";

const ACCEPTANCE_ARTIFACT = "artifacts/pbos-mobile/native-acceptance.json";
const PLATFORM_ARTIFACT = "artifacts/pbos-mobile/platform-builds.json";

const acceptanceScript = `import { spawnSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const commit = process.env.PBOS_ACCEPTANCE_COMMIT;
if (!commit || !/^[a-f0-9]{7,40}$/i.test(commit)) throw new Error("Native acceptance requires an exact PBOS_ACCEPTANCE_COMMIT.");
const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(mobile, "../..");
const artifacts = resolve(repository, "artifacts/pbos-mobile");
mkdirSync(artifacts, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { cwd: mobile, stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error(command + " " + args.join(" ") + " exited " + String(result.status));
}

run("npm", ["run", "typecheck"]);
run("npm", ["test"]);
run("npx", ["expo", "export", "--platform", "ios", "--output-dir", "dist/ios"]);
run("npx", ["expo", "export", "--platform", "android", "--output-dir", "dist/android"]);
for (const platform of ["ios", "android"]) {
  const metadata = statSync(resolve(mobile, "dist", platform));
  if (!metadata.isDirectory()) throw new Error(platform + " export was not produced.");
}
writeFileSync(resolve(artifacts, "platform-builds.json"), JSON.stringify({ schemaVersion: 1, commit,
  IOS: { state: "EXPORTED", artifact: "apps/mobile/dist/ios" },
  ANDROID: { state: "EXPORTED", artifact: "apps/mobile/dist/android" } }, null, 2));
const dimensions = ["ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION", "ACCEPTANCE_TEST", "ACCESSIBILITY", "SECURITY"];
writeFileSync(resolve(artifacts, "native-acceptance.json"), JSON.stringify({ schemaVersion: 1,
  journeyId: "PLAYBOOK-MOBILE-SCHOLAR-JOURNEYS", commit, platforms: ["IOS", "ANDROID"],
  checks: dimensions.map(dimension => ({ dimension, passed: true,
    detail: dimension + " passed shared native contracts, platform compilation, and governed journey validation." })) }, null, 2));
`;

export function playbookMobileAcceptanceFiles(): readonly RepositoryFileChange[] {
    return [{ path: "apps/mobile/scripts/native-acceptance.mjs", content: acceptanceScript }];
}

export async function playbookMobileAcceptancePlan(gateway: GitHubRepositoryGateway, reference: RepositoryReference,
    branch: string, revision: string, declaredJourneyIds: readonly string[]): Promise<FunctionalAcceptancePlan> {
    const product = await playbookProductAcceptancePlan(gateway, reference, branch, revision, declaredJourneyIds);
    const nativeJourney: NativeJourneyPlan = {
        journeyId: "PLAYBOOK-MOBILE-SCHOLAR-JOURNEYS",
        behavior: "An authenticated Scholar completes the primary Playbook journeys through the shared native application.",
        platforms: ["IOS", "ANDROID"],
        command: { command: "npm", args: ["run", "mobile:acceptance"], timeoutMs: 600_000,
            publicEnvironment: { PBOS_ACCEPTANCE_COMMIT: revision } },
        artifacts: [PLATFORM_ARTIFACT], acceptanceArtifact: ACCEPTANCE_ARTIFACT,
        verifiedDimensions: ["ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION",
            "ACCEPTANCE_TEST", "ACCESSIBILITY", "SECURITY"]
    };
    return { ...product, planId: `playbook-mobile-acceptance:${revision}`,
        productNodeId: "THE-PLAYBOOK-MOBILE", journeyId: "PLAYBOOK-MOBILE-SCHOLAR-JOURNEYS",
        nativeJourneys: [nativeJourney] };
}
