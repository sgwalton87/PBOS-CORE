/** Durable encrypted mission checkpoints: SQL transaction validates the exact fence. */
import type { NeonLeaseSql } from "./neon-fenced-lease-provider";
import type { HostedExecutionLease } from "./hosted-approved-mission";

export class NeonFencedMissionCheckpoint {
  constructor(private readonly db: NeonLeaseSql) {}
  async commit(
    lease: HostedExecutionLease,
    missionId: string,
    repository: string,
    expectedVersion: bigint,
    encryptedCheckpoint: Uint8Array
  ): Promise<bigint> {
    if (lease.resource !== `pbos:mission:${repository}:${missionId}` ||
        expectedVersion < 0n || encryptedCheckpoint.length === 0) {
      throw new Error("Checkpoint mission lineage, version or ciphertext invalid.");
    }
    // pg bytea hex input avoids depending on a particular PostgreSQL driver.
    const hex = Buffer.from(encryptedCheckpoint).toString("hex");
    const result = await this.db.query<{ version: string | number | bigint }>(
      "SELECT pbos_runner.commit_mission_checkpoint($1,$2,$3,$4::uuid,$5::bigint,$6::bigint,decode($7,'hex')) AS version",
      [missionId,repository,lease.resource,lease.ownerId,lease.fencingToken.toString(),expectedVersion.toString(),hex]);
    const version = result.rows[0]?.version;
    if (version === undefined || version === null) throw new Error("Checkpoint commit returned no version.");
    return BigInt(version);
  }
}
