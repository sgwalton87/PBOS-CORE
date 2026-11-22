import { describe, expect, it, vi } from "vitest";
import { FencedCloudStateCoordinator, SqlExecutor } from "../fenced-cloud-state-coordinator";

describe("fenced cloud state coordinator", () => {
  it("refuses execution when canonical Genesis is absent", async () => {
    const db = { query: vi.fn().mockResolvedValue([]) };
    await expect(new FencedCloudStateCoordinator(db as unknown as SqlExecutor)
      .verifyCanonicalState("a".repeat(64))).rejects.toThrow("missing");
  });
  it("refuses mismatched Genesis fingerprint", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ version: "1", plaintext_sha256: "b".repeat(64) }]) };
    await expect(new FencedCloudStateCoordinator(db as unknown as SqlExecutor)
      .verifyCanonicalState("a".repeat(64))).rejects.toThrow("fingerprint mismatch");
  });
  it("accepts only the existing matching Genesis fingerprint", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ version: "3", plaintext_sha256: "a".repeat(64) }]) };
    await expect(new FencedCloudStateCoordinator(db as unknown as SqlExecutor)
      .verifyCanonicalState("a".repeat(64))).resolves.toBe(3n);
  });
  it("fails closed when a competing runner owns the lease", async () => {
    const db = { query: vi.fn().mockResolvedValue([]) } as unknown as SqlExecutor;
    await expect(new FencedCloudStateCoordinator(db).acquire(
      "playbook", "00000000-0000-4000-8000-000000000001"
    )).rejects.toThrow("held by another runner");
  });
  it("never commits after the lease has expired", async () => {
    const db = { query: vi.fn() };
    const coordinator = new FencedCloudStateCoordinator(db as unknown as SqlExecutor);
    await expect(coordinator.commit({
      resource: "playbook", ownerId: "00000000-0000-4000-8000-000000000001",
      fencingToken: 1n, expiresAt: new Date(0)
    }, 1n, Uint8Array.from([1]), "a".repeat(64))).rejects.toThrow("expired");
    expect(db.query).not.toHaveBeenCalled();
  });
  it("uses version and fencing token in the database commit", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ version: "7" }]) };
    const coordinator = new FencedCloudStateCoordinator(db as unknown as SqlExecutor);
    const version = await coordinator.commit({
      resource: "playbook", ownerId: "00000000-0000-4000-8000-000000000001",
      fencingToken: 8n, expiresAt: new Date(Date.now() + 60000)
    }, 6n, Uint8Array.from([1, 2]), "a".repeat(64));
    expect(version).toBe(7n);
    expect(db.query.mock.calls[0][1].slice(0, 4)).toEqual([
      "playbook", "00000000-0000-4000-8000-000000000001", "8", "6"
    ]);
  });
});
