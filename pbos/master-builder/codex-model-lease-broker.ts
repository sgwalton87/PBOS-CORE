import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { evidenceSha256 } from "./remote-attestation";

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_LEASE_MS = 120_000;
const MAX_LEASES = 1024;

interface Lease {
    readonly bindingDigest: string;
    readonly expires: number;
    readonly digest?: string;
    readonly abort: AbortController;
    remaining: number;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const authenticated = (actual: string | null, expected: string) =>
    actual !== null && timingSafeEqual(Buffer.from(hash(actual)), Buffer.from(hash(`Bearer ${expected}`)));

async function readBoundedJson(request: Request): Promise<Record<string, unknown>> {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Expected request body.");
    const chunks: Buffer[] = [];
    let size = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.length;
            if (size > MAX_REQUEST_BYTES) throw new Error("Request too large.");
            chunks.push(Buffer.from(next.value));
        }
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected object.");
        return body as Record<string, unknown>;
    } finally {
        await reader.cancel().catch(() => undefined);
    }
}

/** Serve on separate HTTPS origins. Process loss revokes every model lease. Route both origins to the same broker instance. */
export class CodexModelLeaseBroker {
    readonly #leases = new Map<string, Lease>();
    readonly #tokens = new Map<string, string>();
    readonly #adminCredential: string;
    readonly #openAiCredential: string;
    readonly #modelOrigin: string;
    readonly #model: string;
    readonly #upstream: typeof fetch;

    constructor(options: { adminCredential: string; openAiCredential: string; modelOrigin: string; model: string }, upstream = fetch) {
        if (options.adminCredential.length < 32 || options.openAiCredential.length < 16 || !options.model ||
            !/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(options.modelOrigin)) throw new Error("Dedicated model broker configuration is missing.");
        this.#adminCredential = options.adminCredential;
        this.#openAiCredential = options.openAiCredential;
        this.#modelOrigin = options.modelOrigin;
        this.#model = options.model;
        this.#upstream = upstream;
    }

    async administer(request: Request): Promise<Response> {
        const path = new URL(request.url).pathname;
        if (request.method !== "POST" || !["/v1/codex/leases", "/v1/codex/leases/revoke"].includes(path) ||
            !authenticated(request.headers.get("authorization"), this.#adminCredential)) return new Response(null, { status: 403 });
        let body: Record<string, unknown>;
        try { body = await readBoundedJson(request); } catch { return new Response(null, { status: 400 }); }
        const { fence, bindingDigest } = body;
        if (typeof fence !== "string" || !/^[a-f0-9-]{36}$/.test(fence) || !evidenceSha256(bindingDigest)) {
            return new Response(null, { status: 400 });
        }
        const now = Date.now();
        for (const [id, entry] of this.#leases) {
            if (entry.expires + MAX_LEASE_MS > now) continue;
            if (entry.digest) this.#tokens.delete(entry.digest);
            this.#leases.delete(id);
        }
        const prior = this.#leases.get(fence);
        if ((prior && prior.bindingDigest !== bindingDigest) || (!prior && this.#leases.size >= MAX_LEASES)) {
            return new Response(null, { status: 409 });
        }
        if (path.endsWith("/revoke")) {
            prior?.abort.abort();
            if (prior?.digest) this.#tokens.delete(prior.digest);
            this.#leases.set(fence, { bindingDigest, expires: now + 15 * 60_000, abort: new AbortController(), remaining: 0 });
            return new Response(null, { status: 204 });
        }
        const deadline = typeof body.deadline === "string" ? Date.parse(body.deadline) : NaN;
        if (prior || body.audience !== this.#modelOrigin || body.permission !== "responses:create" ||
            !(deadline > now && deadline - now <= 15 * 60_000)) return new Response(null, { status: 409 });
        const token = randomBytes(32).toString("base64url");
        const digest = hash(token);
        // Keep a lease strictly shorter than the sandbox lifetime.
        const expires = Math.min(now + MAX_LEASE_MS, deadline - 5000);
        if (expires <= now) return new Response(null, { status: 409 });
        this.#leases.set(fence, { bindingDigest, expires, digest, abort: new AbortController(), remaining: 24 });
        this.#tokens.set(digest, fence);
        return Response.json({ id: fence, bindingDigest, token, expiresAt: new Date(expires).toISOString(),
            audience: this.#modelOrigin, permission: "responses:create" }, { status: 201, headers: { "cache-control": "no-store" } });
    }

    async respond(request: Request): Promise<Response> {
        const address = new URL(request.url);
        const bearer = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
        const id = bearer ? this.#tokens.get(hash(bearer)) : undefined;
        const lease = id && this.#leases.get(id);
        if (address.origin !== this.#modelOrigin || address.pathname !== "/v1/responses" || address.search ||
            request.method !== "POST" || !lease || lease.abort.signal.aborted || lease.expires <= Date.now() || lease.remaining <= 0) {
            return new Response(null, { status: 403 });
        }
        let body: Record<string, unknown>;
        try { body = await readBoundedJson(request); } catch { return new Response(null, { status: 400 }); }
        if (body.model !== this.#model || body.background === true || (body.tools !== undefined &&
            (!Array.isArray(body.tools) || body.tools.some(tool => !tool || !["function", "custom"].includes(tool.type))))) {
            return new Response(null, { status: 403 });
        }
        const remaining = lease.expires - Date.now();
        if (remaining <= 0 || lease.abort.signal.aborted || lease.remaining <= 0) return new Response(null, { status: 403 });
        lease.remaining--;
        try {
            const response = await this.#upstream("https://api.openai.com/v1/responses", {
                method: "POST", redirect: "error", signal: AbortSignal.any([request.signal, lease.abort.signal, AbortSignal.timeout(remaining)]),
                headers: { authorization: `Bearer ${this.#openAiCredential}`, "content-type": "application/json" },
                body: JSON.stringify({ ...body, model: this.#model, store: false, background: false,
                    max_output_tokens: Math.min(typeof body.max_output_tokens === "number" ? body.max_output_tokens : 4096, 4096) }),
            });
            if (!response.ok) {
                await response.body?.cancel();
                return new Response(null, { status: response.status === 429 ? 429 : 502 });
            }
            return new Response(response.body, { headers: {
                "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store",
            } });
        } catch { return new Response(null, { status: 502 }); }
    }
}
