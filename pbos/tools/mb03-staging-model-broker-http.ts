/**
 * Staging-only HTTP adapter for the in-process CodexModelLeaseBroker.
 * Host-header isolation is additional defense; admin Bearer auth remains mandatory.
 * All credential material is read only from protected, regular mounted secret files.
 * No mission execution, Genesis access or Cloud Run resource creation.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import { CodexModelLeaseBroker } from "../master-builder/codex-model-lease-broker";

const MAX_BODY = 1024 * 1024;
function origin(name: string): string {
  const value = process.env[name];
  if (!value) throw Error(`Missing ${name}`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value || url.port || url.username || url.password ||
      !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(url.hostname)) throw Error(`Invalid ${name}`);
  return value;
}
function privateSecret(name: string, minimum: number): string {
  const path = process.env[name];
  if (!path || !resolve(path).startsWith("/var/run/")) throw Error(`Missing protected ${name}`);
  const meta = lstatSync(path);
  if (!meta.isFile() || meta.isSymbolicLink() || (meta.mode & 0o077) !== 0 || meta.size > 16384) {
    throw Error(`Invalid protected ${name}`);
  }
  const value = readFileSync(path, "utf8").trim();
  if (value.length < minimum) throw Error(`Invalid protected ${name}`);
  return value;
}
export function createStagingModelBrokerHandler(broker: CodexModelLeaseBroker, adminOrigin: string, modelOrigin: string) {
  if (adminOrigin === modelOrigin) throw Error("Distinct broker origins required");
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      // Never trust forwarded-host headers for origin selection.
      const host = req.headers.host?.toLowerCase();
      const adminHost = new URL(adminOrigin).host;
      const modelHost = new URL(modelOrigin).host;
      if (host !== adminHost && host !== modelHost) { res.writeHead(403).end(); return; }
      if (req.method !== "POST" || !req.url || req.url.includes("?")) { res.writeHead(403).end(); return; }
      const path = new URL(req.url, `https://${host}`).pathname;
      const isAdmin = host === adminHost && (path === "/v1/codex/leases" || path === "/v1/codex/leases/revoke");
      const isModel = host === modelHost && path === "/v1/responses";
      if (!isAdmin && !isModel) { res.writeHead(403).end(); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_BODY) { res.writeHead(413).end(); return; }
        chunks.push(bytes);
      }
      const request = new Request(`https://${host}${req.url}`, {
        method: "POST",
        headers: { authorization: req.headers.authorization ?? "", "content-type": req.headers["content-type"] ?? "" },
        body: Buffer.concat(chunks),
      });
      const response = isAdmin ? await broker.administer(request) : await broker.respond(request);
      res.statusCode = response.status;
      for (const key of ["content-type", "cache-control"] as const) {
        const value = response.headers.get(key);
        if (value) res.setHeader(key, value);
      }
      res.setHeader("cache-control", "no-store");
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      // Fail closed without request, credential, or upstream body disclosure.
      if (!res.headersSent) res.writeHead(502);
      res.end();
    }
  };
}

if (require.main === module) {
  const adminOrigin = origin("PBOS_MODEL_ADMIN_ORIGIN");
  const modelOrigin = origin("PBOS_MODEL_ORIGIN");
  const port = Number(process.env.PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("Invalid PORT");
  const broker = new CodexModelLeaseBroker({
    adminCredential: privateSecret("PBOS_MODEL_BROKER_ADMIN_FILE", 32),
    openAiCredential: privateSecret("PBOS_MODEL_UPSTREAM_KEY_FILE", 16),
    modelOrigin,
    model: process.env.PBOS_WORKER_MODEL ?? "",
  });
  const server = createServer(createStagingModelBrokerHandler(broker, adminOrigin, modelOrigin));
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.listen(port, "0.0.0.0");
}
