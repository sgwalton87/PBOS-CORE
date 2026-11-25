import { evidenceDigest } from "./remote-attestation";
import { encodeRetainedEvidence, RemoteEvidenceArchive } from "./remote-evidence-archive";

/** Write through the GCS create-only API and verify through the actual evidence mount. */
export class GcsHostedEvidence {
    private readonly mounted: RemoteEvidenceArchive;

    constructor(directory: string, private readonly token: (signal: AbortSignal) => Promise<string>,
        private readonly http = fetch) {
        this.mounted = new RemoteEvidenceArchive(directory, 90);
    }

    async preserve(value: unknown): Promise<string> {
        const bytes = encodeRetainedEvidence(value, 90);
        const digest = evidenceDigest(bytes);
        const endpoint = new URL("https://storage.googleapis.com/upload/storage/v1/b/pbos-genesis-staging-mb03-execution-state/o");
        endpoint.search = new URLSearchParams({ uploadType: "media", name: "synthetic/evidence/" + digest,
            ifGenerationMatch: "0" }).toString();
        const signal = AbortSignal.timeout(10_000);
        const bearer = await this.token(signal);
        if (!bearer || /\s/.test(bearer)) throw new Error("Evidence storage identity unavailable.");
        const response = await this.http(endpoint, { method: "POST", signal, redirect: "error",
            headers: { authorization: "Bearer " + bearer, "content-type": "application/json" }, body: bytes.toString("utf8") });
        await response.body?.cancel();
        if (response.status !== 200 && response.status !== 412) throw new Error("Evidence object creation refused.");
        this.mounted.read(digest);
        return digest;
    }
}
