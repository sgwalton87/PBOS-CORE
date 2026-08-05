import { createServer } from "http";
import { homedir } from "os";
import { join } from "path";
import { GenesisStateRepository } from "../genesis-state";
import { ProductionRuntimeService } from "../production-runtime";
import { renderMissionControl } from "./mission-control-view";

export function startMissionControl(port = Number(process.env.PBOS_MISSION_CONTROL_PORT ?? 4180),
    statePath = join(process.env.PBOS_STATE_HOME ?? join(homedir(), ".pbos"), "genesis-state.json")) {
    const runtime = () => new ProductionRuntimeService(new GenesisStateRepository(statePath));
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (request.method !== "GET") { response.writeHead(405).end(); return; }
        if (url.pathname === "/" || url.pathname === "/mission-control") {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
            response.end(renderMissionControl(runtime().snapshot())); return;
        }
        if (url.pathname === "/api/mission-control/status") {
            response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
            response.end(JSON.stringify(runtime().snapshot())); return;
        }
        if (url.pathname === "/api/mission-control/events") {
            const after = Number.parseInt(url.searchParams.get("after") ?? "0", 10);
            response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
            response.end(JSON.stringify(runtime().events(url.searchParams.get("runId") ?? undefined, Number.isFinite(after) ? after : 0))); return;
        }
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); response.end("Not found");
    });
    server.listen(port, "127.0.0.1", () => process.stdout.write(`PBOS Mission Control: http://127.0.0.1:${port}/mission-control\n`));
    return server;
}

if (require.main === module) startMissionControl();
