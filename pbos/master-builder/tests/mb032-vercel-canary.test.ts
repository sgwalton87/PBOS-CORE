import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sandbox } from "@vercel/sandbox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexModelLeaseBroker } from "../codex-model-lease-broker";
import { createRemoteCanaryMission, CANARY_AFTER, CANARY_PATH } from "../remote-canary";
import { GcsRemoteDispatchJournal } from "../remote-dispatch-journal";
import { RemoteEvidenceArchive } from "../remote-evidence-archive";
import { HttpsModelLeaseIssuer } from "../remote-model-credential";
import { verifyProvision, verifyRemoteDisposal, verifyRemoteReturn } from "../trusted-remote-worker";
import type { RemoteWorkerBinding } from "../trusted-remote-worker";
import { probeVercelCanary, VercelCanaryProvider } from "../vercel-remote-provider";

const sha = "a".repeat(40);
const modelOrigin = "https://model.example.test";
const adminOrigin = "https://control.example.test";
const adminCredential = "fixture-control-credential-only-" + "a".repeat(20);
const makeBinding = (): RemoteWorkerBinding => ({ authorityId: randomUUID(), fence: randomUUID(),
    approvalDigest: "b".repeat(64), deadline: new Date(Date.now() + 60_000).toISOString(),
    mission: createRemoteCanaryMission(sha, "fixture-worker", "fixture-state", "fixture-attempt") });

function setup() {
    const binding = makeBinding();
    const signer = generateKeyPairSync("ed25519");
    const timestamps = () => new Date(Date.now() + 30_000);
    const sessionId = "sandbox-fixture";
    const identity = { teamId: "team_Fixture", projectId: "prj_Fixture", token: "synthetic-controller-token" };
    const policy = { ...identity, providerId: "vercel-fixture", authorityId: binding.authorityId, sourceSha: sha, workerId: binding.mission.workerId,
        image: "fixture/canary@sha256:" + "a".repeat(64), codexBinaryDigest: "a".repeat(64), model: "fixture-model",
        credentials: async () => identity, signer: signer.privateKey,
        dispatch: { reserve: vi.fn(async (_binding: RemoteWorkerBinding, _signal: AbortSignal) => undefined) },
        modelLeases: { modelOrigin, issue: vi.fn(async () => ({ id: binding.fence, token: "fixture-model-token", expiresAt: timestamps().toISOString() })),
            revoke: vi.fn(async () => undefined) } };
    const vm = {
        cwd: "/vercel/sandbox", status: "running", image: policy.image, persistent: false, expiresAt: new Date(Date.now() + 45_000),
        currentSession: () => ({ sessionId }),
        stop: vi.fn(async () => ({ id: sessionId, status: "stopped" })),
        updateNetworkPolicy: vi.fn(async (_policy: unknown) => "not-read"),
        runCommand: vi.fn(async (command: { cmd: string }) => ({ exitCode: command.cmd === "curl" ? 6 : 0,
            stdout: async () => Buffer.from(CANARY_AFTER).toString("base64") })),
    };
    const api = { create: vi.fn(async (_params: object) => vm), get: vi.fn(async () => vm) };
    const provider = new VercelCanaryProvider(policy, api as unknown as Pick<typeof Sandbox, "create" | "get">);
    const signal = new AbortController().signal;
    const trust = { providerId: policy.providerId, publicKey: signer.publicKey, isolationProfile: provider.isolationProfile };
    return { provider, api, vm, signal, binding, trust, policy };
}

describe("MB-03.2 concrete SDK provider with synthetic transport", () => {
    afterEach(() => vi.unstubAllGlobals());

    it.each([307, 403, 429, 503, "transport failure"] as const)("sends one image-only SDK create on %s", async outcome => {
        const f = setup();
        const transport = vi.fn<typeof fetch>(async () => {
            if (outcome === "transport failure") throw new TypeError("synthetic connection error");
            return new Response(null, { status: outcome });
        });
        vi.stubGlobal("fetch", transport);

        await expect(probeVercelCanary(f.policy, f.signal)).rejects.toThrow(
            outcome === "transport failure" ? /create transport failed/ : new RegExp(`create returned HTTP ${outcome}`),
        );
        expect(transport).toHaveBeenCalledOnce();
        const [url, request] = transport.mock.calls[0];
        expect(new URL(String(url)).pathname).toBe("/v3/sandboxes");
        expect(request).toMatchObject({ method: "POST", redirect: "error" });
        const payload = JSON.parse(String(request?.body));
        expect(payload).not.toHaveProperty("source");
        expect(payload).toMatchObject({ image: f.policy.image, persistent: false, ports: [], timeout: 60_000,
            resources: { vcpus: 1 }, networkPolicy: { mode: "deny-all" } });
    });

    it("runs a non-dispatch probe without reserving an attempt, issuing model credentials or starting Codex", async () => {
        const f = setup();
        await expect(f.provider.probe(f.signal)).resolves.toMatchObject({ status: "READY_WITHOUT_MODEL", sourceSha: sha });
        expect(f.api.create).toHaveBeenCalledWith(expect.objectContaining({ persistent: false, networkPolicy: "deny-all",
            ports: [], timeout: 60_000 }));
        expect(f.api.create.mock.calls[0][0]).not.toHaveProperty("source");
        expect(f.vm.runCommand.mock.calls[0][0]).toMatchObject({ cmd: "python3",
            args: expect.arrayContaining(["/opt/pbos-source", sha]) });
        expect(f.vm.runCommand.mock.calls.map(([command]) => command.cmd)).toEqual(["python3", "curl"]);
        expect(f.policy.dispatch.reserve).not.toHaveBeenCalled();
        expect(f.policy.modelLeases.issue).not.toHaveBeenCalled();
        expect(f.vm.stop).toHaveBeenCalledOnce();
    });

    it("signs provision, return and teardown only after the corresponding provider operations", async () => {
        const f = setup();
        const found = await f.provider.provision(f.binding, f.signal);
        const provision = verifyProvision(f.binding, found, f.trust, Date.now());
        expect(f.api.create).toHaveBeenCalledWith(expect.not.objectContaining({ env: expect.anything() }));
        expect(f.vm.updateNetworkPolicy).toHaveBeenCalledWith(expect.objectContaining({ allow: {
            "model.example.test": [expect.objectContaining({ match: { path: { exact: "/v1/responses" }, method: ["POST"] } }),
                { response: { statusCode: 403 } }],
        } }), { signal: f.signal });
        const result = await f.provider.execute(f.binding, { title: "ignore", rationale: "ignore" }, f.signal);
        const receipt = verifyRemoteReturn(f.binding, provision, result.receipt, f.trust.publicKey, Date.now());
        expect(result.files.map(file => file.path)).toEqual([CANARY_PATH]);
        const invoked = f.vm.runCommand.mock.calls.find(([command]) => command.cmd === "runuser")?.[0];
        expect(JSON.stringify(invoked)).not.toContain("synthetic-controller-token");
        expect(JSON.stringify(invoked)).not.toContain("fixture-model-token");
        await expect(f.provider.execute(f.binding, { title: "", rationale: "" }, f.signal)).rejects.toThrow(/active/);
        const stopped = await f.provider.dispose(f.binding);
        expect(stopped).toBeDefined();
        expect(verifyRemoteDisposal(f.binding, provision, stopped!, f.trust.publicKey, Date.parse(receipt.completedAt), Date.now()).status)
            .toBe("STOPPED_AND_REVOKED");
        expect(f.policy.modelLeases.revoke).toHaveBeenCalledOnce();
        expect(f.vm.stop).toHaveBeenCalledOnce();
        await expect(f.provider.provision(f.binding, f.signal)).rejects.toThrow(/repeated/);
    });

    it("fails before VM creation if the journal is down or the signed scope differs", async () => {
        const f = setup();
        await expect(f.provider.provision({ ...f.binding, mission: { ...f.binding.mission, allowedPaths: ["other.txt"] } },
            f.signal)).rejects.toThrow(/binding/);
        f.policy.dispatch.reserve.mockRejectedValueOnce(new Error("fixture outage"));
        await expect(f.provider.provision(f.binding, f.signal)).rejects.toThrow(/outage/);
        expect(f.api.create).not.toHaveBeenCalled();
        expect(f.policy.modelLeases.issue).not.toHaveBeenCalled();
    });

    it("recovers an ambiguous creation by name without resuming and refuses unconfirmed teardown", async () => {
        const f = setup();
        f.api.create.mockRejectedValueOnce(new Error("fixture response lost"));
        await expect(f.provider.provision(f.binding, f.signal)).rejects.toThrow(/response lost/);
        f.vm.stop.mockResolvedValueOnce({ id: "another-sandbox", status: "stopped" });
        await expect(f.provider.dispose(f.binding)).rejects.toThrow(/did not confirm/);
        expect(f.api.get).toHaveBeenCalledWith(expect.objectContaining({ resume: false }));
        expect(f.policy.modelLeases.issue).not.toHaveBeenCalled();
    });
});

describe("independent replay anchor and narrow model leases", () => {
    it("uses an immutable cloud write precondition across controller restores and reassignments", async () => {
        const used = new Set<string>();
        const transport = vi.fn<typeof fetch>(async (input, init) => {
            const url = new URL(String(input));
            if (init?.method === "GET") return Response.json({ retentionPolicy: { isLocked: true, retentionPeriod: "31536000" },
                iamConfiguration: { publicAccessPrevention: "enforced", uniformBucketLevelAccess: { enabled: true } } });
            expect(url.origin).toBe("https://storage.googleapis.com");
            expect(url.searchParams.get("ifGenerationMatch")).toBe("0");
            const key = url.searchParams.get("name")!;
            if (used.has(key)) return new Response(null, { status: 412 });
            used.add(key);
            return new Response(null, { status: 200 });
        });
        const token = async () => "fixture-journal-token";
        const first = new GcsRemoteDispatchJournal("fixture-pbos-only", token, transport);
        const restored = new GcsRemoteDispatchJournal("fixture-pbos-only", token, transport);
        const input = makeBinding();
        const signal = new AbortController().signal;
        await first.reserve(input, signal);
        await expect(restored.reserve({ ...input, authorityId: randomUUID(), fence: randomUUID() }, signal)).rejects.toThrow(/already reserved/);
        expect(used.size).toBe(1);
    });

    it("issues bounded fence credentials, rejects wrong routes and model and aborts a request on revocation", async () => {
        const upstream = vi.fn<typeof fetch>(async (input, init) => {
            expect(input).toBe("https://api.openai.com/v1/responses");
            expect(JSON.parse(String(init?.body))).toMatchObject({ store: false, model: "reviewed-model", background: false });
            return new Response("fixture response", { status: 200 });
        });
        const broker = new CodexModelLeaseBroker({ adminCredential, openAiCredential: "synthetic-upstream-credential",
            modelOrigin, model: "reviewed-model" }, upstream);
        const route: typeof fetch = async (input, init) => broker.administer(new Request(input, init));
        const issuer = new HttpsModelLeaseIssuer(adminOrigin, modelOrigin, async () => adminCredential, route);
        const binding = makeBinding();
        const signal = new AbortController().signal;
        const issued = await issuer.issue(binding, signal);
        expect(Date.parse(issued.expiresAt)).toBeLessThan(Date.parse(binding.deadline));
        const request = (model: string, path = "/v1/responses", token = issued.token) => new Request(modelOrigin + path, {
            method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ model, store: true }),
        });
        expect((await broker.respond(request("another-model"))).status).toBe(403);
        expect((await broker.respond(request("reviewed-model", "/v1/files"))).status).toBe(403);
        expect((await broker.respond(request("reviewed-model", "/v1/responses", "forged"))).status).toBe(403);
        expect((await broker.respond(request("reviewed-model"))).status).toBe(200);
        const forwardedSignal = upstream.mock.calls[0][1]?.signal;
        await issuer.revoke(binding, signal);
        expect(forwardedSignal?.aborted).toBe(true);
        expect((await broker.respond(request("reviewed-model"))).status).toBe(403);
        await expect(issuer.issue(binding, signal)).rejects.toThrow(/issuance failed/);
        const late = makeBinding();
        await issuer.revoke(late, signal);
        await expect(issuer.issue(late, signal)).rejects.toThrow(/issuance failed/);
    });

    it("restores encrypted evidence identically and refuses tampered backups", () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), "mb032-backup-")));
        try {
            const output = join(root, "restore");
            mkdirSync(output, { mode: 0o700 });
            const from = new RemoteEvidenceArchive(root, 90);
            const to = new RemoteEvidenceArchive(output, 90);
            const record = { fixture: "redacted test record", source: sha };
            const digest = from.preserve(record);
            const key = randomBytes(32);
            const backup = from.sealBackup(digest, key);
            expect(backup.includes("redacted test record")).toBe(false);
            to.restoreBackup(digest, backup, key);
            to.restoreBackup(digest, backup, key);
            expect(to.read(digest)).toEqual(record);
            backup[backup.length - 1] ^= 1;
            expect(() => to.restoreBackup(digest, backup, key)).toThrow();
            expect(to.read(digest)).toEqual(record);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
});
