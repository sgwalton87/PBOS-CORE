import { randomUUID } from "node:crypto";
import { FencedCloudStateCoordinator, type Lease } from "./fenced-cloud-state-coordinator";

/**
 * Fail-closed gate for a cloud mission. This is not a replacement for
 * transactional state persistence: the actual Genesis repository must be
 * migrated to a fenced cloud-backed adapter before any mission mutates state.
 */
export class CloudMissionAuthorityGate {
  constructor(private readonly coordinator: FencedCloudStateCoordinator) {}

  async authorize<T>(options: {
    readonly resource: string;
    readonly expectedGenesisSha256: string;
    readonly ttlSeconds?: number;
    readonly execute: (lease: Lease, genesisVersion: bigint) => Promise<T>;
  }): Promise<T> {
    if (!options.resource.startsWith("pbos-mission:")) {
      throw new Error("Cloud mission requires a dedicated mission lease resource");
    }
    // Verify the original Genesis before acquiring execution authority.
    const version = await this.coordinator.verifyCanonicalState(options.expectedGenesisSha256);
    const lease = await this.coordinator.acquire(options.resource, randomUUID(), options.ttlSeconds ?? 30);
    if (lease.expiresAt.getTime() <= Date.now()) throw new Error("Cloud mission lease is already expired");
    // This callback must use the fenced cloud state repository, not JsonStateStore.
    return options.execute(lease, version);
  }
}
