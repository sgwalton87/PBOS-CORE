import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyMission001JournalRead } from "../mb03-protected-playbook-codex";

const identity = "pbos-mb03-playbook-codex@pbos-genesis-staging.iam.gserviceaccount.com";
const bucket = "pbos-genesis-staging-mb03-dispatch-journal";
const object = "pbos-dispatch/2a2e06c94942a07b9054bf5f7d96f95b5a16496f6f973d5283969c5348a792ac";
const environment = { CLOUD_RUN_JOB: "pbos-mb03-playbook-readiness", PBOS_MISSION_EXECUTION_APPROVED: "false",
    PBOS_DISPATCH_JOURNAL_BUCKET: bucket, PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT: identity,
    PBOS_PLAYBOOK_SOURCE_SHA: "b2c2259d67f30ca068f32cd1889542991f294e42" };
const objectUrl = "https://storage.googleapis.com/storage/v1/b/" + bucket + "/o/" + encodeURIComponent(object);
const metadata = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/";
const missing = () => Response.json({ error: { code: 404, message: "No such object: " + bucket + "/" + object } }, { status: 404 });
const forbidden = () => Response.json({ error: { code: 403, message: "Permission storage.objects.get denied",
    errors: [{ reason: "forbidden" }] } }, { status: 403 });

function transport(responses: Response[], email = identity) {
    const mock = vi.fn(async (input: URL | string, options: RequestInit) => {
        const url = String(input);
        expect(options.redirect).toBe("error");
        if (url === metadata + "email") return new Response(email, { headers: { "Metadata-Flavor": "Google" } });
        if (url === metadata + "token") return Response.json({ access_token: "fixture", expires_in: 300 },
            { headers: { "Metadata-Flavor": "Google" } });
        expect(options.method).toBe("GET");
        expect(options.headers).toEqual({ authorization: "Bearer fixture" });
        expect(options.body).toBeUndefined();
        const response = responses.shift();
        if (!response) throw Error("Unexpected storage request");
        return response;
    });
    vi.stubGlobal("fetch", mock);
    return mock;
}

describe("Mission 001 readiness journal read", () => {
    afterEach(() => vi.unstubAllGlobals());
    it("checks only the exact two object generations after runtime identity verification", async () => {
        const mock = transport([missing(), forbidden()]);
        await expect(verifyMission001JournalRead(environment)).resolves.toEqual({
            status: "MISSION_001_JOURNAL_READ_VERIFIED", missionId: "MB03-MISSION-001",
            reservationHttp: 404, siblingHttp: 403, missionExecutionAuthorized: false });
        expect(mock.mock.calls.map(([url]) => String(url))).toEqual([metadata + "email", metadata + "token",
            objectUrl + "?fields=generation", objectUrl + "-other?fields=generation"]);
    });
    it.each([
        ["existing reservation", () => new Response("{}"), "RECOVERY_DISPATCH_RESERVED"],
        ["wrong missing resource", () => Response.json({ error: { code: 404, message: "No such bucket" } }, { status: 404 }), "ABSENCE_UNVERIFIED"],
        ["unreadable reservation", forbidden, "LOOKUP_HTTP_403"]
    ] as const)("stops on %s before a sibling read", async (_name, response, reason) => {
        const mock = transport([response()]);
        await expect(verifyMission001JournalRead(environment)).rejects.toThrow(reason);
        expect(mock).toHaveBeenCalledTimes(3);
    });
    it.each([() => new Response("{}"), missing, () => Response.json({ error: { code: 403,
        message: "Quota exceeded", errors: [{ reason: "rateLimitExceeded" }] } }, { status: 403 })])(
        "rejects a sibling response that does not establish permission denial", async response => {
            const mock = transport([missing(), response()]);
            await expect(verifyMission001JournalRead(environment)).rejects.toThrow("SIBLING_UNVERIFIED");
            expect(mock).toHaveBeenCalledTimes(4);
        });
    it.each([{ CLOUD_RUN_JOB: "pbos-mb03-playbook-codex" }, { PBOS_MISSION_EXECUTION_APPROVED: "true" },
        { PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT: "other" }, { PBOS_DISPATCH_JOURNAL_BUCKET: "other" },
        { PBOS_PLAYBOOK_SOURCE_SHA: "other" }])("rejects wrong bindings before requesting credentials", async override => {
            const mock = transport([]);
            await expect(verifyMission001JournalRead({ ...environment, ...override })).rejects.toThrow();
            expect(mock).not.toHaveBeenCalled();
        });
    it("rejects an unexpected service account reported by the metadata server", async () => {
        const mock = transport([], "someone-else");
        await expect(verifyMission001JournalRead(environment)).rejects.toThrow("Storage probe");
        expect(mock).toHaveBeenCalledTimes(1);
    });
});
