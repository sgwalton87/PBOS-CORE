import { evidenceDigest, evidenceJson } from "./remote-attestation";
import type { RemoteWorkerBinding } from "./trusted-remote-worker";

type AccessToken = (signal: AbortSignal) => Promise<string>;

/** Requires bucket metadata read and create-only object access on the independent journal. */
export class GcsRemoteDispatchJournal {
    constructor(private readonly bucket: string, private readonly token: AccessToken, private readonly http = fetch) {
        if (!/^[a-z0-9][a-z0-9-]{8,61}[a-z0-9]$/.test(bucket)) throw new Error("A dedicated dispatch journal bucket is required.");
    }

    /** Read bucket policy with the same credential used at dispatch, without reserving a mission. */
    async verifyProtection(signal: AbortSignal): Promise<void> {
        await this.verifiedAccessToken(signal);
    }

    private async verifiedAccessToken(signal: AbortSignal): Promise<string> {
        const token = await this.token(signal);
        if (!token || /\s/.test(token)) throw new Error("Dispatch journal credential unavailable.");
        const properties = new URL(`https://storage.googleapis.com/storage/v1/b/${this.bucket}`);
        properties.search = new URLSearchParams({ fields: "retentionPolicy,lifecycle,iamConfiguration" }).toString();
        const metadata = await this.http(properties, { method: "GET", redirect: "error", signal,
            headers: { authorization: `Bearer ${token}` } });
        if (!metadata.ok) {
            await metadata.body?.cancel();
            throw new Error(`Independent dispatch journal protection could not be verified (HTTP ${metadata.status}).`);
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
        return token;
    }

    private reservationName(repository: string, missionId: string): string {
        return "pbos-dispatch/" + evidenceDigest(evidenceJson([repository.toLowerCase(), missionId]));
    }

    /** Recovery requires an authenticated absence check on the same protected object used by reserve. */
    async assertUnreserved(repository: string, missionId: string, signal: AbortSignal): Promise<void> {
        const token = await this.verifiedAccessToken(signal);
        const name = this.reservationName(repository, missionId);
        await this.assertObjectAbsent(name, token, signal);
    }

    private readObjectGeneration(name: string, token: string, signal: AbortSignal) {
        const url = new URL(`https://storage.googleapis.com/storage/v1/b/${this.bucket}/o/${encodeURIComponent(name)}`);
        url.searchParams.set("fields", "generation");
        return this.http(url, { method: "GET", redirect: "error", signal,
            headers: { authorization: `Bearer ${token}` } });
    }

    private async assertObjectAbsent(name: string, token: string, signal: AbortSignal): Promise<void> {
        const response = await this.readObjectGeneration(name, token, signal);
        if (response.status === 404) {
            const body = await response.json().catch(() => null) as { error?: { code?: number; message?: string } } | null;
            if (body?.error?.code === 404 && body.error.message === `No such object: ${this.bucket}/${name}`) return;
            throw Error("RECOVERY_DISPATCH_ABSENCE_UNVERIFIED");
        }
        await response.body?.cancel();
        if (response.ok) throw Error("RECOVERY_DISPATCH_RESERVED");
        throw Error(`RECOVERY_DISPATCH_LOOKUP_HTTP_${response.status}`);
    }

    /** Read the reservation and a neighboring negative control with the same workload token. */
    async verifyReservationReadBoundary(repository: string, missionId: string, signal: AbortSignal): Promise<void> {
        const token = await this.token(signal);
        if (!token || /\s/.test(token)) throw Error("RECOVERY_JOURNAL_IDENTITY");
        const name = this.reservationName(repository, missionId);
        await this.assertObjectAbsent(name, token, signal);
        const sibling = await this.readObjectGeneration(name + "-other", token, signal);
        if (sibling.status === 403) {
            const body = await sibling.json().catch(() => null) as {
                error?: { code?: number; message?: string; errors?: { reason?: string }[] }
            } | null;
            const error = body?.error;
            if (error?.code === 403 && typeof error.message === "string" &&
                error.message.includes("storage.objects.get") && Array.isArray(error.errors) &&
                error.errors.some(entry => entry?.reason === "forbidden")) return;
        } else {
            await sibling.body?.cancel();
        }
        throw Error(`RECOVERY_JOURNAL_SIBLING_UNVERIFIED_HTTP_${sibling.status}`);
    }

    async reserve(binding: RemoteWorkerBinding, signal: AbortSignal): Promise<void> {
        const { mission } = binding;
        const name = this.reservationName(mission.repository, mission.missionId);
        const endpoint = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${this.bucket}/o`);
        endpoint.search = new URLSearchParams({ uploadType: "media", name, ifGenerationMatch: "0" }).toString();
        const token = await this.verifiedAccessToken(signal);
        const response = await this.http(endpoint, { method: "POST", redirect: "error", signal,
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: evidenceJson({ bindingDigest: evidenceDigest(evidenceJson(binding)), sourceSha: mission.sourceSha }) });
        await response.body?.cancel();
        if (response.status === 412) throw new Error("Remote mission is already reserved in the independent dispatch journal.");
        if (response.status !== 200) throw new Error("Independent dispatch journal is unavailable or refused admission.");
    }
}
