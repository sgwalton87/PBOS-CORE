import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { CodexModelLeaseBroker } from "../master-builder/codex-model-lease-broker";
import { createStagingModelBrokerHandler } from "./mb03-staging-model-broker-http";

const adminOrigin = "https://pbos-mb03-model-broker-211508256780.us-west1.run.app";
const modelOrigin = "https://model---pbos-mb03-model-broker-211508256780.us-west1.run.app";
const credential = "synthetic-administrator-credential-" + "a".repeat(24);
const upstreamKey = "fixture-only-upstream-key";
const model = "fixture-reviewed-model";

function fixture() {
  const upstream = vi.fn<typeof fetch>(async () => Response.json({ output: [], id: "synthetic" }));
  const broker = new CodexModelLeaseBroker({
    adminCredential: credential, openAiCredential: upstreamKey, modelOrigin, model,
  }, upstream);
  const handler = createStagingModelBrokerHandler(broker, adminOrigin, modelOrigin);
  const send = async (host: string, path: string, body: object, token?: string, method = "POST") => {
    const input = Readable.from([Buffer.from(JSON.stringify(body))]) as IncomingMessage;
    input.method = method;
    input.url = path;
    input.headers = { host, "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) };
    let code = 200;
    let payload = Buffer.alloc(0);
    const headers: Record<string, string> = {};
    const response = {
      get headersSent() { return false; },
      setHeader(key: string, value: string) { headers[key.toLowerCase()] = value; return this; },
      writeHead(status: number) { code = status; return this; },
      end(data?: Buffer | string) { payload = Buffer.isBuffer(data) ? data : Buffer.from(data ?? ""); return this; },
      get statusCode() { return code; },
      set statusCode(status: number) { code = status; },
    } as unknown as ServerResponse;
    await handler(input, response);
    return { code, body: payload.length ? payload.toString("utf8") : "", headers };
  };
  return { send, upstream };
}

describe("MB-03 staging broker HTTP host isolation", () => {
  it("rejects wrong host and wrong origin/path combinations before contacting upstream", async () => {
    const f = fixture();
    expect((await f.send("unknown.example.test", "/v1/codex/leases", {})).code).toBe(403);
    expect((await f.send(new URL(modelOrigin).host, "/v1/codex/leases", {})).code).toBe(403);
    expect((await f.send(new URL(adminOrigin).host, "/v1/responses", {})).code).toBe(403);
    expect((await f.send(new URL(adminOrigin).host, "/v1/codex/leases?query=true", {})).code).toBe(403);
    expect((await f.send(new URL(adminOrigin).host, "/v1/codex/leases", {}, undefined, "GET")).code).toBe(403);
    expect(f.upstream).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated administration and unauthorized model requests", async () => {
    const f = fixture();
    const adminHost = new URL(adminOrigin).host;
    const modelHost = new URL(modelOrigin).host;
    expect((await f.send(adminHost, "/v1/codex/leases", {})).code).toBe(403);
    expect((await f.send(modelHost, "/v1/responses", { model })).code).toBe(403);
    expect(f.upstream).not.toHaveBeenCalled();
  });

  it("issues via admin origin, serves only via model origin and revokes by matching fence", async () => {
    const f = fixture();
    const fence = randomUUID();
    const bindingDigest = "a".repeat(64);
    const issued = await f.send(new URL(adminOrigin).host, "/v1/codex/leases", {
      fence, bindingDigest, deadline: new Date(Date.now() + 90_000).toISOString(),
      audience: modelOrigin, permission: "responses:create",
    }, credential);
    expect(issued.code).toBe(201);
    const token = JSON.parse(issued.body).token as string;
    expect(issued.headers["cache-control"]).toBe("no-store");
    const response = await f.send(new URL(modelOrigin).host, "/v1/responses", { model, input: "synthetic" }, token);
    expect(response.code).toBe(200);
    expect(f.upstream).toHaveBeenCalledOnce();
    const [url, options] = f.upstream.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options?.headers).toEqual(expect.objectContaining({ authorization: "Bearer " + upstreamKey }));
    const revoke = await f.send(new URL(adminOrigin).host, "/v1/codex/leases/revoke",
      { fence, bindingDigest }, credential);
    expect(revoke.code).toBe(204);
    expect((await f.send(new URL(modelOrigin).host, "/v1/responses", { model }, token)).code).toBe(403);
    expect(f.upstream).toHaveBeenCalledOnce();
  });

  it("limits request bodies and fails closed without leaking credentials", async () => {
    const f = fixture();
    const huge = { padding: "x".repeat(1024 * 1024 + 10) };
    const response = await f.send(new URL(adminOrigin).host, "/v1/codex/leases", huge, credential);
    expect(response.code).toBe(413);
    expect(response.body).not.toContain(credential);
    expect(response.body).not.toContain(upstreamKey);
    expect(f.upstream).not.toHaveBeenCalled();
  });
});
