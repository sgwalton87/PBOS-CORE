/**
 * PBOS fenced state coordinator. SQL transport is injected by a private
 * backend, never a browser/Supabase anon client. Does not create Genesis.
 */
export interface SqlExecutor {
  query<T extends Record<string, unknown>>(sql: string, parameters: readonly unknown[]): Promise<readonly T[]>;
}
export interface Lease {
  readonly resource: string;
  readonly ownerId: string;
  readonly fencingToken: bigint;
  readonly expiresAt: Date;
}
export class FencedCloudStateCoordinator {
  constructor(private readonly db: SqlExecutor) {}

  async acquire(resource: string, ownerId: string, ttlSeconds = 30): Promise<Lease> {
    if (!resource.trim() || !/^[0-9a-f-]{36}$/i.test(ownerId) || ttlSeconds < 5 || ttlSeconds > 300) {
      throw new Error("Invalid PBOS lease request");
    }
    const rows = await this.db.query<{ fencing_token: string | number | bigint; expires_at: string }>(
      "SELECT fencing_token, expires_at FROM pbos_runner.acquire_lease($1,$2::uuid,$3::integer)",
      [resource, ownerId, ttlSeconds]);
    if (rows.length !== 1) throw new Error("PBOS mission lease is held by another runner");
    return { resource, ownerId, fencingToken: BigInt(rows[0].fencing_token), expiresAt: new Date(rows[0].expires_at) };
  }

  /** Refuse cloud execution until the existing, encrypted Genesis state has been imported. */
  async verifyCanonicalState(expectedSha256: string): Promise<bigint> {
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw new Error("A verified canonical Genesis SHA-256 is required");
    }
    const rows = await this.db.query<{ version: string | number | bigint; plaintext_sha256: string }>(
      "SELECT version, plaintext_sha256 FROM pbos_runner.canonical_state WHERE state_key = 'genesis'",
      []);
    if (rows.length !== 1) throw new Error("Canonical Genesis state is missing; refusing cloud execution");
    if (rows[0].plaintext_sha256.trim() !== expectedSha256) {
      throw new Error("Canonical Genesis fingerprint mismatch; refusing cloud execution");
    }
    return BigInt(rows[0].version);
  }

  async commit(lease: Lease, expectedVersion: bigint, encryptedState: Uint8Array, sha256: string): Promise<bigint> {
    if (!/^[a-f0-9]{64}$/.test(sha256) || !encryptedState.length) {
      throw new Error("Invalid encrypted canonical state payload");
    }
    if (lease.expiresAt.getTime() <= Date.now()) throw new Error("PBOS lease expired before state commit");
    const rows = await this.db.query<{ version: string | number | bigint }>(
      "SELECT pbos_runner.commit_state($1,$2::uuid,$3::bigint,$4::bigint,$5::bytea,$6::char(64)) AS version",
      [lease.resource, lease.ownerId, lease.fencingToken.toString(), expectedVersion.toString(),
        Buffer.from(encryptedState), sha256]);
    if (rows.length !== 1) throw new Error("PBOS canonical state commit was not acknowledged");
    return BigInt(rows[0].version);
  }
}
