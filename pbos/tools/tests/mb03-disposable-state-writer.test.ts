import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenesisStateRepository } from "../../genesis-state/genesis-state-repository";
import { describe, expect, it, vi } from "vitest";
import { GenerationStateStore } from "../../genesis-state/generation-state-store";
import { disposableStateObject } from "../../genesis-state/gcs-disposable-state";
import { verifyStateWriter } from "../mb03-protected-playbook-codex";

import { object, fixture, orphan } from "./fixtures/disposable-gcs-object";

describe("staging disposable object writer", () => {
    it("allows exactly one concurrent scratch handoff and rejects a replay", async () => {
        const f = orphan();
        const results = await Promise.allSettled([f.transfer("owner A"), f.transfer("owner B")]);
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
        const winner = f.objects.get(object)!;
        expect(["owner A", "owner B"]).toContain(winner.bytes);
        expect(f.objects.has(object + ".lock")).toBe(false);
        await expect(f.transfer("owner C")).rejects.toThrow("STATE_RECOVERY_PIN");
        expect(f.objects.get(object)).toEqual(winner);
    });
    it.each(["live", "state", "lock", "lock body"])("refuses %s without writing", async kind => {
        const f = orphan();
        if (kind === "state") f.pin.stateSha256 = "0".repeat(64);
        if (kind === "lock") f.pin.lockGeneration = "99";
        if (kind === "lock body") f.objects.set(object + ".lock", { ...f.oldLock, bytes: '{"expectedGeneration":"8"}' });
        await expect(f.transfer("candidate", kind === "live" ? "synthetic/genesis-state.json" : object)).rejects.toThrow();
        expect(f.http.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
    });
    it("retains both the competing data version and the new lock when a stale writer wins the data race", async () => {
        const f = orphan();
        const normal = f.http.getMockImplementation()!;
        f.http.mockImplementation(async (url, init) => {
            const response = await normal(url, init);
            if (init.method === "POST" && url.searchParams.get("name") === object + ".lock") {
                f.objects.set(object, { generation: "73", bytes: "competing write" });
            }
            return response;
        });
        await expect(f.transfer("candidate")).rejects.toThrow("STATE_HTTP_412");
        expect(f.objects.get(object)).toEqual({ generation: "73", bytes: "competing write" });
        expect(f.objects.has(object + ".lock")).toBe(true);
        expect(f.http.mock.calls.filter(([, init]) => init.method === "DELETE")).toHaveLength(0);
    });
    it("retains the rotated lock if the data write succeeds but its acknowledgment is lost", async () => {
        const f = orphan();
        const normal = f.http.getMockImplementation()!;
        f.http.mockImplementation(async (url, init) => {
            const response = await normal(url, init);
            if (init.method === "POST" && url.searchParams.get("name") === object) throw Error("lost response");
            return response;
        });
        await expect(f.transfer("candidate")).rejects.toThrow("lost response");
        expect(f.objects.get(object)?.bytes).toBe("candidate");
        expect(f.objects.get(object + ".lock")?.generation).not.toBe(f.oldLock.generation);
        await expect(f.transfer("other")).rejects.toThrow("STATE_RECOVERY_PIN");
        expect(f.http.mock.calls.filter(([, init]) => init.method === "DELETE")).toHaveLength(0);
    });
    it.each(["lock", "data", "release"])("survives throttling during %s across successive updates", async stage => {
        const { call, objects, http, wait } = fixture();
        const first = await call("create-scratch", undefined, "0");
        const second = await call("replace", first.generation, "1");
        const normal = http.getMockImplementation()!;
        const attempts: string[] = [];
        http.mockImplementation(async (url, init) => {
            const name = url.searchParams.get("name");
            const phase = init.method === "DELETE" ? "release" : name === object ? "data" : "lock";
            if (phase === stage) {
                attempts.push(JSON.stringify([String(url), init.method, init.body]));
                if (attempts.length === 1) return new Response(null, { status: 429, headers: { "retry-after": "2" } });
            }
            return normal(url, init);
        });
        const third = await call("replace", second.generation, "2");
        expect(attempts).toHaveLength(2);
        expect(attempts[1]).toBe(attempts[0]);
        expect(wait.mock.calls.map(([delay]) => delay)).toEqual([2000]);
        expect(objects.get(object)).toEqual({ generation: third.generation, bytes: "2" });
        expect(objects.has(object + ".lock")).toBe(false);
    });
    it.each([["1", 3], ["90", 1]] as const)("stops persistent throttling with Retry-After %s", async (after, expectedRequests) => {
        const { call, objects, http } = fixture();
        const first = await call("create-scratch", undefined, "0");
        const normal = http.getMockImplementation()!;
        let throttled = 0;
        http.mockImplementation(async (url, init) => {
            if (url.searchParams.get("name") === object) {
                throttled++;
                return new Response(null, { status: 429, headers: { "retry-after": after } });
            }
            return normal(url, init);
        });
        await expect(call("replace", first.generation, "1")).rejects.toThrow("STATE_HTTP_429");
        expect(throttled).toBe(expectedRequests);
        expect(objects.get(object)).toEqual({ generation: first.generation, bytes: "0" });
        expect(objects.has(object + ".lock")).toBe(true);
    });
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
