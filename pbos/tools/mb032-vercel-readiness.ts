import { probeVercelCanary } from "../master-builder/vercel-remote-provider";

async function main() {
    const fields = {
        token: process.env.PBOS_VERCEL_SANDBOX_TOKEN,
        teamId: process.env.PBOS_VERCEL_SANDBOX_TEAM_ID,
        projectId: process.env.PBOS_VERCEL_SANDBOX_PROJECT_ID,
        image: process.env.PBOS_VERCEL_CANARY_IMAGE,
        codexBinaryDigest: process.env.PBOS_VERCEL_CODEX_SHA256,
        sourceSha: process.argv[2],
    };
    const missing = Object.entries(fields).filter(([, value]) => !value).map(([field]) => field);
    if (missing.length) {
        process.stderr.write(`Sandbox readiness blocked. Missing configuration: ${missing.join(", ")}.\n`);
        process.exitCode = 1;
        return;
    }
    try {
        const outcome = await probeVercelCanary(fields as Parameters<typeof probeVercelCanary>[0], AbortSignal.timeout(75_000));
        process.stdout.write(`${JSON.stringify(outcome)}\n`);
    } catch {
        process.stderr.write("Sandbox readiness failed. Check the dedicated provider, pinned image, source and teardown evidence.\n");
        process.exitCode = 1;
    }
}

void main();
