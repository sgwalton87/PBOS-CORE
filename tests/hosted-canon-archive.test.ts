import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { verifyHostedCanonArchive } from "../pbos/production-runtime/hosted-canon-archive";
import type { NeonLeaseSql } from "../pbos/production-runtime/neon-fenced-lease-provider";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const rows = Array.from({ length: 23 }, (_, index) => ({ content_text: `doc-${index}`, content_sha256: hash(`doc-${index}`) }));
const manifest = JSON.stringify({ documents: rows.map((row, index) => ({
  id: `PPS-${index < 16 ? String(index).padStart(3, "0") : 2000 + index}`, sha256: row.content_sha256,
})) });
const pin = hash(manifest);
const role = "pbos_canon_archive_reader";

function fixture(allowed = true, contents = rows) {
  const query = vi.fn(async (_sql: string, _values: readonly unknown[]) => ({ rows: [] as unknown[] }));
  query.mockResolvedValueOnce({ rows: [{ permitted: allowed }] }).mockResolvedValueOnce({ rows: contents });
  return { query, db: { query: query as unknown as NeonLeaseSql["query"] } };
}

describe("hosted Canon archive verification", () => {
  it("verifies 23 pinned digests via bounded queries and emits counts only", async () => {
    const { db, query } = fixture();
    await expect(verifyHostedCanonArchive(db, role, manifest, pin)).resolves.toEqual({ manifestSha256: pin, verifiedDocuments: 23 });
    expect(query.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
    expect(query.mock.calls[0][0]).toContain("transaction_read_only");
    expect(query.mock.calls[1][1]).toEqual([rows.map(row => row.content_sha256)]);
  });

  it("fails before retrieving archive bytes for a wrong pin, owner, or non-read-only role", async () => {
    const { db, query } = fixture(false);
    await expect(verifyHostedCanonArchive(db, role, manifest, "0".repeat(64))).rejects.toThrow("pin mismatch");
    await expect(verifyHostedCanonArchive(db, "pbos_runner_owner", manifest, pin)).rejects.toThrow("Scoped archive reader");
    expect(query).not.toHaveBeenCalled();
    await expect(verifyHostedCanonArchive(db, role, manifest, pin)).rejects.toThrow("not read-only");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects missing, altered, or unpinned documents", async () => {
    for (const data of [rows.slice(1), [{ ...rows[0], content_text: "tampered" }, ...rows.slice(1)],
      [...rows, { content_text: "extra", content_sha256: hash("extra") }]]) {
      const { db } = fixture(true, data);
      await expect(verifyHostedCanonArchive(db, role, manifest, pin)).rejects.toThrow(/missing|hash mismatch/);
    }
  });
});
