import { startCloudRunIntegrationService } from "./cloud-run-runtime";

void startCloudRunIntegrationService().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`PBOS Cloud Run startup failed: ${message}\n`);
    process.exitCode = 1;
});
