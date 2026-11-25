// Child process for the offline recovery test. All external services are fixture adapters.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GenesisStateRepository } from "../../../genesis-state";
import type { ProductionRun } from "../../contracts";
import { runHostedApprovedMission } from "../../hosted-approved-mission";
import { ProductionMissionRunner } from "../../production-mission-runner";
import { ProductionRuntimeService } from "../../production-runtime-service";

async function main() {
    const { request, approval, scope, publicKey } = JSON.parse(readFileSync(0, "utf8"));
    const namespace = "mb03-hosted-staging-fixture";
    class InterruptedState extends GenesisStateRepository {
        override saveProductionRun(run: ProductionRun) {
            super.saveProductionRun(run);
            if (run.status === "RUNNING" && this.productionEvents(run.runId).at(-1)?.type === "EXECUTION_PLAN_READY") {
                process.kill(process.pid, "SIGKILL");
            }
        }
    }
    const state = new InterruptedState(join(process.cwd(), "state.json"), namespace);
    // The fixed fixture clock gives the replacement process an expired original lease.
    const fixtureClock = new Date(Date.parse(approval.payload.issuedAt) - 60_000);
    const runtime = new ProductionRuntimeService(state, 30_000, () => fixtureClock);
    await runHostedApprovedMission(new ProductionMissionRunner(state, runtime), request, approval, {
        disposableNamespace: namespace, trustedPublicKeyPem: publicKey,
        hostAttested: async () => true, canonicalStateVerified: async () => true,
        acquireFencedLease: async (resource, ownerId) => ({ resource, ownerId, fencingToken: 1n }),
        assertFencedLease: async () => true, renewFencedLease: async () => true,
        releaseFencedLease: async () => undefined,
        recordApprovalNonce: async nonce => {
            writeFileSync("nonce.fixture", nonce, { flag: "wx", mode: 0o600 });
            return true;
        }
    }, scope, () => async () => {
        writeFileSync("worker-started.fixture", "unexpected", { flag: "wx", mode: 0o600 });
        throw Error("Fixture reached worker dispatch before the interruption");
    });
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
