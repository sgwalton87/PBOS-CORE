import { createReadStream, existsSync, statSync } from "fs";
import { createServer } from "http";
import { extname, resolve, sep } from "path";
import { renderGenesisConsumerPortal } from "./genesis-consumer-portal";

const root = resolve(__dirname, "..", "..");
const contentTypes: Record<string, string> = { ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };

export function startGenesisConsumerPortal(port = Number(process.env.PBOS_PORTAL_PORT ?? 4173)) {
    const server = createServer((request, response) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        if (pathname === "/" || pathname === "/index.html") {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
            response.end(renderGenesisConsumerPortal());
            return;
        }
        if (pathname.startsWith("/assets/brand/")) {
            const file = resolve(root, pathname.slice(1));
            if (file.startsWith(`${resolve(root, "assets", "brand")}${sep}`) && existsSync(file) && statSync(file).isFile()) {
                response.writeHead(200, { "content-type": contentTypes[extname(file)] ?? "application/octet-stream", "cache-control": "public, max-age=300" });
                createReadStream(file).pipe(response);
                return;
            }
        }
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
    });
    server.listen(port, "127.0.0.1", () => process.stdout.write(`PBOS Genesis consumer portal: http://127.0.0.1:${port}\n`));
    return server;
}

if (require.main === module) startGenesisConsumerPortal();
