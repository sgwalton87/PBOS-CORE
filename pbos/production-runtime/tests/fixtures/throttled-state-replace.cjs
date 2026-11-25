// The repository's writer API is synchronous. Run the real async GCS adapter in
// a child, as staging does, with an in-memory HTTP transport and a synthetic key.
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { stateRequest } = require("../../../genesis-state/gcs-state-request.cjs");
const { current, expected, bytes, throttle } = JSON.parse(readFileSync(0, "utf8"));
const object = "synthetic/state-writer-probes/12345678-1111-4111-8111-111111111111.json";
const objects = new Map([[object, current]]);
let generation = Number(current.generation);
let throttled = false;

async function storage(url, options) {
    if (url.origin !== "https://storage.googleapis.com") throw Error("Unexpected fixture origin");
    const name = url.searchParams.get("name") ?? decodeURIComponent(url.pathname.split("/o/")[1]);
    if (name !== object && name !== object + ".lock") throw Error("Unexpected fixture object");
    if (url.searchParams.get("ifGenerationMatch") !== (objects.get(name)?.generation ?? "0")) {
        return new Response(null, { status: 412 });
    }
    if (options.method === "DELETE") {
        objects.delete(name);
        return new Response(null, { status: 204 });
    }
    if (options.method !== "POST") throw Error("Unexpected fixture method");
    if (name === object && throttle && !throttled) {
        if (!objects.has(object + ".lock")) throw Error("Fault must occur with the lock held");
        throttled = true;
        return new Response(null, { status: 429 });
    }
    const version = String(++generation);
    objects.set(name, { bytes: options.body, generation: version });
    const md5Hash = createHash("md5").update(options.body).digest("base64");
    return Response.json({ name, generation: version, md5Hash });
}

stateRequest({ object, op: "replace", generation: expected, bytes, token: "fixture" },
    storage, async () => {}).then(() => {
    if (objects.has(object + ".lock")) throw Error("Fixture lock retained");
    process.stdout.write(JSON.stringify({ current: objects.get(object), throttled }));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
