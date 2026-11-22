import { evidenceDigest, evidenceJson } from "./remote-attestation";
import type { RemoteWorkerBinding } from "./trusted-remote-worker";

export interface ScopedModelLease {
    readonly id: string;
    readonly token: string;
    readonly expiresAt: string;
}

export class HttpsModelLeaseIssuer {
    readonly modelOrigin: string;
    readonly #adminOrigin: string;
    readonly #controlCredential: (signal: AbortSignal) => Promise<string>;
    readonly #http: typeof fetch;

    constructor(adminOrigin: string, modelOrigin: string, controlCredential: (signal: AbortSignal) => Promise<string>,
        http = fetch) {
        const origin = (value: string) => {
            const url = new URL(value);
            if (url.protocol !== "https:" || url.origin !== value || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z][a-z0-9-]*)+$/.test(url.hostname) ||
                url.port) throw new Error("Model lease service requires a pinned HTTPS DNS origin.");
            return url.origin;
        };
        this.#adminOrigin = origin(adminOrigin);
        this.modelOrigin = origin(modelOrigin);
        if (this.#adminOrigin === this.modelOrigin) throw new Error("Model ingress and credential administration must be separate.");
        this.#controlCredential = controlCredential;
        this.#http = http;
    }

    private async request(path: string, method: string, body: object, signal: AbortSignal) {
        const credential = await this.#controlCredential(signal);
        if (!credential || /\s/.test(credential)) throw new Error("Model control credential unavailable.");
        return this.#http(this.#adminOrigin + path, { method, signal, redirect: "error",
            headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
            body: evidenceJson(body) });
    }

    async issue(binding: RemoteWorkerBinding, signal: AbortSignal): Promise<ScopedModelLease> {
        const bindingDigest = evidenceDigest(evidenceJson(binding));
        const response = await this.request("/v1/codex/leases", "POST", {
            bindingDigest, fence: binding.fence, deadline: binding.deadline, audience: this.modelOrigin, permission: "responses:create",
        }, signal);
        if (response.status !== 201) {
            await response.body?.cancel();
            throw new Error("Scoped model lease issuance failed.");
        }
        const data = await response.json() as ScopedModelLease & { bindingDigest: string; audience: string; permission: string };
        if (data.bindingDigest !== bindingDigest || data.id !== binding.fence || data.audience !== this.modelOrigin ||
            data.permission !== "responses:create" || !/^[A-Za-z0-9_-]{32,512}$/.test(data.token) ||
            !(Date.parse(data.expiresAt) > Date.now() && Date.parse(data.expiresAt) <= Date.parse(binding.deadline))) {
            throw new Error("Scoped model lease does not match the dispatch fence.");
        }
        return { id: data.id, token: data.token, expiresAt: data.expiresAt };
    }

    async revoke(binding: RemoteWorkerBinding, signal: AbortSignal): Promise<void> {
        const response = await this.request("/v1/codex/leases/revoke", "POST", {
            bindingDigest: evidenceDigest(evidenceJson(binding)), fence: binding.fence,
        }, signal);
        await response.body?.cancel();
        if (response.status !== 204) throw new Error("Scoped model lease revocation was not confirmed.");
    }
}
