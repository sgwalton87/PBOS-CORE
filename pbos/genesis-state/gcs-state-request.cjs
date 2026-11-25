// The Genesis repository API is synchronous. Isolate one bounded HTTP operation
// per child invocation; bearer and object bytes travel only through private pipes.
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");

const bucket = "pbos-genesis-staging-mb03-execution-state";
const maxBytes = 32 * 1024 * 1024;
const scratch = /^synthetic\/state-writer-probes\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/;
const validGeneration = value => typeof value === "string" && /^[1-9][0-9]*$/.test(value);

async function googleAccessToken(signal) {
    const response = await fetch(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        { headers: { "Metadata-Flavor": "Google" }, signal, redirect: "error" }
    );
    if (!response.ok || response.headers.get("metadata-flavor") !== "Google") throw Error("STATE_IDENTITY");
    const record = await response.json();
    if (typeof record.access_token !== "string" || !record.access_token || /\s/.test(record.access_token) ||
        !Number.isFinite(record.expires_in) || record.expires_in < 60) throw Error("STATE_IDENTITY");
    return record.access_token;
}

async function stateRequest({ object, op, generation, bytes, token }, http = fetch) {
    if (object !== "synthetic/genesis-state.json" && !scratch.test(object)) throw Error("STATE_TARGET");
    if (typeof token !== "string" || !token || /\s/.test(token)) throw Error("STATE_IDENTITY");
    const headers = { authorization: "Bearer " + token };
    const media = name => new URL("https://storage.googleapis.com/storage/v1/b/" + bucket + "/o/" + encodeURIComponent(name));
    async function request(url, method, body) {
        const response = await http(url, { method, headers: body === undefined ? headers : {
            ...headers, "content-type": "application/json", "content-md5": createHash("md5").update(body).digest("base64")
        }, body, redirect: "error", signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
            await response.body?.cancel();
            throw Error("STATE_HTTP_" + response.status);
        }
        return response;
    }
    async function put(name, expected, body) {
        const url = new URL("https://storage.googleapis.com/upload/storage/v1/b/" + bucket + "/o");
        url.search = new URLSearchParams({ uploadType: "media", name, ifGenerationMatch: expected,
            fields: "generation,name,md5Hash" }).toString();
        const receipt = await (await request(url, "POST", body)).json();
        if (!validGeneration(receipt.generation) || receipt.name !== name ||
            receipt.md5Hash !== createHash("md5").update(body).digest("base64")) throw Error("STATE_RECEIPT");
        return receipt.generation;
    }
    async function remove(name, expected) {
        const url = media(name);
        url.searchParams.set("ifGenerationMatch",expected);
        await (await request(url, "DELETE")).body?.cancel();
    }
    if (op === "read") {
        const url = media(object);
        url.searchParams.set("alt", "media");
        const response = await request(url, "GET");
        const version = response.headers.get("x-goog-generation");
        const size = Number(response.headers.get("content-length"));
        if (!validGeneration(version) || !Number.isSafeInteger(size) || size < 1 || size > maxBytes) {
            await response.body?.cancel();
            throw Error("STATE_METADATA");
        }
        const content = Buffer.from(await response.arrayBuffer());
        if (content.length !== size) throw Error("STATE_SIZE");
        return { generation: version, bytes: content.toString("utf8") };
    }
    if (op === "remove-scratch" && scratch.test(object) && validGeneration(generation)) {
        await remove(object, generation);
        return {};
    }
    if (typeof bytes !== "string" || !bytes || Buffer.byteLength(bytes) > maxBytes) throw Error("STATE_SIZE");
    if (op === "create-scratch" && scratch.test(object)) return { generation: await put(object, "0", bytes) };
    if (op !== "replace" || !validGeneration(generation)) throw Error("STATE_OPERATION");
    // A crashed process leaves a lock for forensic reconciliation. Never steal
    // it on an age threshold. The data precondition also fences external writers.
    const lock = object + ".lock";
    let ownerGeneration;
    try {
        ownerGeneration = await put(lock, "0", JSON.stringify({ expectedGeneration: generation }));
    } catch (error) {
        if (error.message === "STATE_HTTP_412") throw Error("STATE_LOCK_HELD");
        throw error;
    }
    let updated;
    try {
        updated = await put(object, generation, bytes);
    } catch (error) {
        // A 412 is a definite rejection. A lost response has an unknown outcome.
        if (error.message === "STATE_HTTP_412") {
            await remove(lock, ownerGeneration);
            throw Error("STATE_STALE_GENERATION");
        }
        throw error;
    }
    await remove(lock, ownerGeneration);
    return { generation: updated };
}

module.exports = { googleAccessToken, stateRequest };
if (require.main === module) {
    (async () => {
        const input = JSON.parse(readFileSync(0, "utf8"));
        if (input.token === undefined) input.token = await googleAccessToken(AbortSignal.timeout(4000));
        const result = await stateRequest(input);
        process.stdout.write(JSON.stringify(result));
    })().catch(error => {
        process.stderr.write(/^STATE_(HTTP_[0-9]{3}|TARGET|IDENTITY|RECEIPT|METADATA|SIZE|OPERATION|LOCK_HELD|STALE_GENERATION)$/.test(error.message)
            ? error.message : "STATE_TRANSPORT");
        process.exitCode = 1;
    });
}
