import { evidenceDigest, evidenceJson } from "./remote-attestation";
import type { RemoteWorkerBinding } from "./trusted-remote-worker";

type AccessToken = (signal: AbortSignal) => Promise<string>;

/** Give this identity object-create access only. Keep the bucket independent of controller-state backups. */
export class GcsRemoteDispatchJournal {
    constructor(private readonly bucket: string, private readonly token: AccessToken, private readonly http = fetch) {
        if (!/^[a-z0-9][a-z0-9-]{8,61}[a-z0-9]$/.test(bucket)) throw new Error("A dedicated dispatch journal bucket is required.");
    }

    async reserve(binding: RemoteWorkerBinding, signal: AbortSignal): Promise<void> {
        const { mission } = binding;
        const key = evidenceDigest(evidenceJson([mission.repository.toLowerCase(), mission.missionId]));
        const endpoint = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${this.bucket}/o`);
        endpoint.search = new URLSearchParams({ uploadType: "media", name: `pbos-dispatch/${key}`, ifGenerationMatch: "0" }).toString();
        const token = await this.token(signal);
        if (!token || /\s/.test(token)) throw new Error("Dispatch journal credential unavailable.");
        const properties = new URL(`https://storage.googleapis.com/storage/v1/b/${this.bucket}`);
        properties.search = new URLSearchParams({ fields: "retentionPolicy,lifecycle,iamConfiguration" }).toString();
        const metadata = await this.http(properties, { method: "GET", redirect: "error", signal,
            headers: { authorization: `Bearer ${token}` } });
        if (!metadata.ok) {
            await metadata.body?.cancel();
            throw new Error("Independent dispatch journal protection could not be verified.");
        }
        const protection = await metadata.json() as {
            retentionPolicy?: { isLocked?: boolean; retentionPeriod?: string };
            lifecycle?: { rule?: unknown[] };
            iamConfiguration?: { publicAccessPrevention?: string; uniformBucketLevelAccess?: { enabled?: boolean } };
        };
        if (protection.retentionPolicy?.isLocked !== true || !(Number(protection.retentionPolicy.retentionPeriod) >= 31_536_000) ||
            protection.iamConfiguration?.publicAccessPrevention !== "enforced" ||
            protection.iamConfiguration.uniformBucketLevelAccess?.enabled !== true || protection.lifecycle?.rule?.length) {
            throw new Error("Independent dispatch journal bucket does not match the protected retention policy.");
        }
        const response = await this.http(endpoint, { method: "POST", redirect: "error", signal,
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: evidenceJson({ bindingDigest: evidenceDigest(evidenceJson(binding)), sourceSha: mission.sourceSha }) });
        await response.body?.cancel();
        if (response.status === 412) throw new Error("Remote mission is already reserved in the independent dispatch journal.");
        if (response.status !== 200) throw new Error("Independent dispatch journal is unavailable or refused admission.");
    }
}
