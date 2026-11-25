import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenesisStateRepository } from "../../genesis-state/genesis-state-repository";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GenerationStateStore } from "../../genesis-state/generation-state-store";
import { disposableStateObject } from "../../genesis-state/gcs-disposable-state";
import { verifyStateWriter } from "../mb03-protected-playbook-codex";
const { stateRequest } = require("../../genesis-state/gcs-state-request.cjs");

const object = "synthetic/state-writer-probes/08a68416-ef62-4462-9d03-644c4a167284.json";
function fixture() {
    const objects = new Map<string, { generation: string; bytes: string }>();
    let generation = 0;
    const http = vi.fn(async (url: URL, init: RequestInit) => {
        expect(url.origin).toBe("https://storage.googleapis.com");
        expect(init.redirect).toBe("error");
        const name = url.searchParams.get("name") ?? decodeURIComponent(url.pathname.split("/o/")[1]);
        const current = objects.get(name);
        if (init.method === "GET") return current ? new Response(current.bytes, {
            headers: { "content-length": String(Buffer.byteLength(current.bytes)), "x-goog-generation": current.generation }
        }) : new Response(null, { status: 404 });
        if (url.searchParams.get("ifGenerationMatch") !== (current?.generation ?? "0")) return new Response(null, { status: 412 });
        if (init.method === "DELETE") {
            objects.delete(name);
            return new Response(null, { status: 204 });
        }
        const bytes = String(init.body);
        objects.set(name, { bytes, generation: String(++generation) });
        return Response.json({ generation: String(generation), name, md5Hash: createHash("md5").update(bytes).digest("base64") });
    });
    const call = (op: string, ver?: string, bytes?: string, name = object) =>
        stateRequest({ object: name, token: "fixture", op, generation: ver, bytes }, http);
    return { http, call, objects };
}

describe("staging disposable object writer", () => {
    it("locks, replaces exactly one generation, releases its lock and rejects stale state", async () => {
        const { call, objects } = fixture();
        const first = await call("create-scratch", undefined, "{}");
        const second = await call("replace", first.generation, '{"counter":1}');
        expect(objects.has(object + ".lock")).toBe(false);
        await expect(call("replace", first.generation, "{}")).rejects.toThrow("STATE_STALE_GENERATION");
        expect(await call("read")).toEqual({ generation: second.generation, bytes: '{"counter":1}' });
        expect(objects.has(object + ".lock")).toBe(false);
    });
    it("rejects a competing writer without touching its lock", async () => {
        const { call, objects } = fixture();
        const first = await call("create-scratch", undefined, "{}");
        const competing = { generation: "99", bytes: "{}" };
        objects.set(object + ".lock", competing);
        await expect(call("replace", first.generation, '{"unsafe":1}')).rejects.toThrow("STATE_LOCK_HELD");
        expect(objects.get(object + ".lock")).toBe(competing);
        expect((await call("read")).bytes).toBe("{}");
    });
    it("retains the owned lock when the commit outcome is unknown", async () => {
        const { call, objects, http } = fixture();
        const first = await call("create-scratch", undefined, "{}");
        const normal = http.getMockImplementation()!;
        http.mockImplementation(async (url, init) => {
            const response = await normal(url, init);
            if (url.searchParams.get("name") === object) throw Error("lost reply");
            return response;
        });
        await expect(call("replace", first.generation, '{"counter":1}')).rejects.toThrow("lost reply");
        expect(objects.has(object + ".lock")).toBe(true);
        expect(objects.get(object)?.bytes).toBe('{"counter":1}');
    });
    it("refuses live-state creation or deletion and paths outside the disposable boundary", async () => {
        const { call, http } = fixture();
        for (const op of ["create-scratch", "remove-scratch"]) {
            await expect(call(op,"1","{}","synthetic/genesis-state.json")).rejects.toThrow();
        }
        await expect(call("replace","1","{}","synthetic/mission.json")).rejects.toThrow("STATE_TARGET");
        expect(http).not.toHaveBeenCalled();
        expect(() => disposableStateObject("/var/lib/pbos-observation/genesis-state.json")).toThrow();
    });
    it("validates both the current authority and proposed state before issuing a write", () => {
        const backend = { read: () => ({ generation: "1", bytes: '{"authority":"expected"}' }), replace: vi.fn() };
        const store = new GenerationStateStore<{authority:string}>(backend, value => {
            if (value.authority !== "expected") throw Error("authority");
        });
        expect(() => store.update(() => ({ authority: "different" }))).toThrow("authority");
        backend.read = () => ({ generation:"2", bytes:'{"authority":"different"}' });
        expect(() => store.update(() => ({authority:"expected"}))).toThrow("authority");
        expect(backend.replace).not.toHaveBeenCalled();
    });
    it("writes through the hosted repository while the mounted input stays owner-read-only", () => {
        const dir = realpathSync(mkdtempSync(join(tmpdir(), "mb03-writer-test-")));
        const file = join(dir, "genesis-state.json");
        const namespace = "mb03-test";
        const authority = "84464dfd-2ada-4292-a15b-99d3fa5f28e2";
        const original = JSON.stringify({ disposableNamespace: namespace, disposableAuthorityId: authority,
            disposablePlacement: ["host", "path", "1", "2"], systems: [], blueprints: [], sessions: [],
            grants: [], audit: [] });
        let bytes = original;
        let generation = 1;
        const object = {
            read: () => ({ bytes, generation: String(generation) }),
            replace: (expected: string, next: string) => {
                expect(expected).toBe(String(generation));
                generation++;
                bytes = next;
            }
        };
        try {
            writeFileSync(file, original, { mode: 0o400 });
            chmodSync(dir, 0o500);
            const open = () => new GenesisStateRepository(file, namespace, {managedRemote:true, versionedObject:object});
            const repo = open();
            repo.assertDisposableAuthority(authority);
            repo.saveMissionQueue([], "synthetic-test");
            expect(generation).toBe(2);
            expect(JSON.parse(bytes).missionQueue).toEqual([]);
            open().assertDisposableAuthority(authority);
            expect(readFileSync(file, "utf8")).toBe(original);
            bytes = JSON.stringify({ ...JSON.parse(bytes), disposableAuthorityId:"changed" });
            expect(() => repo.saveMissionQueue([], "synthetic-test")).toThrow("authority changed");
            expect(generation).toBe(2);
        } finally {
            chmodSync(dir, 0o700);
            rmSync(dir, { recursive:true, force:true });
        }
    });
    it("rejects a probe when mission execution is enabled", async () => {
        await expect(verifyStateWriter({ PBOS_MISSION_EXECUTION_APPROVED:"true" })).rejects.toThrow("disabled");
    });
});
