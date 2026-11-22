/**
 * Neon-backed MB03 lease provider. SQL client injected by the cloud host;
 * never accepts an in-memory fallback or stores database credentials.
 * Lease expiry is evaluated by PostgreSQL's clock, not the worker clock.
 */
import { HostedExecutionLease } from "./hosted-approved-mission";

export interface NeonLeaseSql {
  query<T extends Record<string, unknown>>(sql: string, params: readonly unknown[]): Promise<{ rows: T[] }>;
}
export interface RenewableHostedLease extends HostedExecutionLease {
  readonly ttlSeconds: number;
}
export class NeonFencedLeaseProvider {
  constructor(private readonly db: NeonLeaseSql, private readonly ttlSeconds = 60) {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 5 || ttlSeconds > 300) {
      throw new Error("Neon fenced lease TTL must be 5–300 seconds.");
    }
  }
  async acquire(resource: string, ownerId: string): Promise<RenewableHostedLease | null> {
    const result = await this.db.query<{ acquired: boolean; token: string | number | bigint }>(
      "SELECT acquired, token FROM pbos_runner.acquire_execution_lease($1,$2::uuid,$3)",
      [resource,ownerId,this.ttlSeconds]);
    const row = result.rows[0];
    if (!row?.acquired || row.token === null || row.token === undefined) return null;
    const fencingToken = BigInt(row.token);
    if (fencingToken < 1n) throw new Error("Neon returned invalid fence.");
    return {resource,ownerId,fencingToken,ttlSeconds:this.ttlSeconds};
  }
  async assert(lease: HostedExecutionLease): Promise<boolean> {
    const result = await this.db.query<{ valid: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pbos_runner.execution_lease WHERE resource=$1 AND owner_id=$2::uuid AND fencing_token=$3::bigint AND expires_at>clock_timestamp()) AS valid",
      [lease.resource,lease.ownerId,lease.fencingToken.toString()]);
    return result.rows[0]?.valid === true;
  }
  async renew(lease: HostedExecutionLease): Promise<boolean> {
    const result = await this.db.query<{ renewed: boolean }>(
      "SELECT pbos_runner.renew_execution_lease($1,$2::uuid,$3::bigint,$4) AS renewed",
      [lease.resource,lease.ownerId,lease.fencingToken.toString(),this.ttlSeconds]);
    return result.rows[0]?.renewed === true;
  }
  async release(lease: HostedExecutionLease): Promise<void> {
    await this.db.query(
      "SELECT pbos_runner.release_execution_lease($1,$2::uuid,$3::bigint) AS released",
      [lease.resource,lease.ownerId,lease.fencingToken.toString()]);
  }
}
