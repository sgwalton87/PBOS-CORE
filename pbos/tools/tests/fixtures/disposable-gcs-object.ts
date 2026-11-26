import { createHash } from "node:crypto";
import { expect, vi } from "vitest";
const { stateRequest } = require("../../../genesis-state/gcs-state-request.cjs");

export const object = "synthetic/state-writer-probes/08a68416-ef62-4462-9d03-644c4a167284.json";
export function fixture() {
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
    const wait = vi.fn(async (_delay: number) => {});
    const call = (op: string, ver?: string, bytes?: string, name = object) =>
        stateRequest({ object: name, token: "fixture", op, generation: ver, bytes }, http, wait);
    return { http, call, objects, wait };
}

export function orphan(bytes = "original fixture state") {
    const f = fixture();
    const previous = { bytes, generation: "71" };
    const oldLock = { bytes: JSON.stringify({ expectedGeneration: "71" }), generation: "72" };
    f.objects.set(object, previous);
    f.objects.set(object + ".lock", oldLock);
    const pin = { lockGeneration: "72", stateSha256: createHash("sha256").update(previous.bytes).digest("hex") };
    const transfer = (bytes: string, name = object) => stateRequest({ token: "fixture", object: name,
        op: "recover-scratch", generation: previous.generation, recovery: pin, bytes }, f.http, f.wait);
    const inspect = () => stateRequest({ token: "fixture", object,
        op: "inspect-recovery", generation: previous.generation, recovery: pin }, f.http, f.wait);
    return { ...f, previous, oldLock, pin, transfer, inspect };
}
