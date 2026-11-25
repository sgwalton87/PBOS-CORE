import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { GenerationObject, GenerationStateStore } from "./generation-state-store";

function storageRequest(object: string, token: string | undefined, op: string, generation?: string, bytes?: string) {
    const child = spawnSync(process.execPath, [join(__dirname, "gcs-state-request.cjs")], {
        input: JSON.stringify({ object, token, op, generation, bytes }), encoding: "utf8",
        env: {}, timeout: 22_000, maxBuffer: 128 * 1024 * 1024
    });
    if (child.status !== 0 || child.error) {
        const reason = /^STATE_[A-Z0-9_]+$/.test(child.stderr ?? "") ? child.stderr : "STATE_TRANSPORT";
        throw new Error(reason);
    }
    return JSON.parse(child.stdout) as { generation: string; bytes: string };
}

function versionedObject(object: string, token?: string): GenerationObject {
    return {
        read: () => storageRequest(object, token, "read"),
        replace: (generation, bytes) => { storageRequest(object, token, "replace", generation, bytes); }
    };
}

export function disposableStateObject(path: string): GenerationObject {
    if (path !== "/var/lib/pbos-missions/genesis-state.json") throw new Error("Unexpected hosted state binding.");
    return versionedObject("synthetic/genesis-state.json");
}

/** Exercise a fresh scratch object with the same writer, including stale-write rejection. */
export function probeDisposableWriter(token: string) {
    const object = "synthetic/state-writer-probes/" + randomUUID() + ".json";
    const backend = versionedObject(object, token);
    const first = storageRequest(object, token, "create-scratch", undefined, '{"counter":0}').generation;
    const store = new GenerationStateStore<{ counter: number }>(backend, value => {
        if (!Number.isInteger(value.counter)) throw new Error("Invalid scratch state.");
    });
    store.update(value => {
        if (value.counter !== 0) throw new Error("Unexpected scratch baseline.");
        return { counter: 1 };
    });
    const updated = backend.read();
    if (updated.generation === first || JSON.parse(updated.bytes).counter !== 1) throw new Error("Scratch update mismatch.");
    try {
        backend.replace(first, '{"counter":2}');
        throw new Error("Scratch stale write was accepted.");
    } catch (error) {
        if (!(error instanceof Error) || error.message !== "STATE_STALE_GENERATION") throw error;
    }
    const verified = backend.read();
    if (verified.generation !== updated.generation || verified.bytes !== updated.bytes) throw new Error("Scratch read-back mismatch.");
    storageRequest(object, token, "remove-scratch", verified.generation);
    return { status: "STATE_WRITER_VERIFIED", object, initialGeneration: first, updatedGeneration: verified.generation,
        staleWriteRejected: true, scratchRemoved: true, missionExecutionAuthorized: false };
}
