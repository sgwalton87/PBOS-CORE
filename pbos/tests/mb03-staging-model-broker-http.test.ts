import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createStagingModelBrokerHandler } from "../tools/mb03-staging-model-broker-http";
import type { CodexModelLeaseBroker } from "../master-builder/codex-model-lease-broker";

const admin = "https://admin.example.test";
const model = "https://model.example.test";

function fixture() {
  const administer = vi.fn(async () => Response.json({ accepted: "admin" }, { status: 201 }));
  const respond = vi.fn(async () => Response.json({ accepted: "model" }, { status: 200 }));
  const handler = createStagingModelBrokerHandler({ administer, respond } as unknown as CodexModelLeaseBroker, admin, model);
  async function send(host: string, path: string, body = "{}", method = "POST") {
    let status = 200;
    let responseBody = Buffer.alloc(0);
    const headers: Record<string, string> = {};
    const req = {
      headers: { host, authorization: "Bearer fixture-credential", "content-type": "application/json" },
      method, url: path,
      async *[Symbol.asyncIterator]() { yield Buffer.from(body); },
    } as unknown as IncomingMessage;
    const res = {
      headersSent: false,
      setHeader(name: string, value: string) { headers[name] = value; },
      writeHead(code: number) { status = code; return this; },
      get statusCode() { return status; },
      set statusCode(code: number) { status = code; },
      end(payload?: Buffer) { if (payload) responseBody = payload; return this; },
    } as unknown as ServerResponse;
    await handler(req, res);
    return { status, body: responseBody.toString("utf8"), headers };
  }
  return { send, administer, respond };
}

describe("MB-03 broker host/path isolation (synthetic; no sockets or upstream calls)", () => {
  it("routes only lease administration on admin host", async () => {
    const f = fixture();
    expect((await f.send("admin.example.test", "/v1/codex/leases")).status).toBe(201);
    expect((await f.send("admin.example.test", "/v1/codex/leases/revoke")).status).toBe(201);
    expect(f.administer).toHaveBeenCalledTimes(2);
    expect(f.respond).not.toHaveBeenCalled();
  });
  it("routes only model responses on model host", async () => {
    const f = fixture();
    expect((await f.send("model.example.test", "/v1/responses")).status).toBe(200);
    expect(f.respond).toHaveBeenCalledTimes(1);
    expect(f.administer).not.toHaveBeenCalled();
  });
  it.each([
    ["admin.example.test", "/v1/responses"],
    ["model.example.test", "/v1/codex/leases"],
    ["model.example.test", "/v1/codex/leases/revoke"],
    ["untrusted.example.test", "/v1/responses"],
    ["admin.example.test:8080", "/v1/codex/leases"],
    ["model.example.test", "/v1/responses?debug=1"],
    ["model.example.test", "/health"],
  ])("denies cross-host and unexpected paths %s %s", async (host, path) => {
    const f = fixture();
    expect((await f.send(host, path)).status).toBe(403);
    expect(f.respond).not.toHaveBeenCalled();
    expect(f.administer).not.toHaveBeenCalled();
  });
  it("denies unsupported methods", async () => {
    const f = fixture();
    expect((await f.send("model.example.test", "/v1/responses", "{}", "GET")).status).toBe(403);
    expect(f.respond).not.toHaveBeenCalled();
  });
  it("rejects oversized request body without calling the broker", async () => {
    const f = fixture();
    expect((await f.send("admin.example.test", "/v1/codex/leases", "x".repeat(1024 * 1024 + 1))).status).toBe(413);
    expect(f.administer).not.toHaveBeenCalled();
  });
  it("rejects identical host origins at construction", () => {
    const handler = { administer: vi.fn(), respond: vi.fn() } as unknown as CodexModelLeaseBroker;
    expect(() => createStagingModelBrokerHandler(handler, admin, admin)).toThrow(/Distinct/);
  });
});
