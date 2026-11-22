import { createHash } from "node:crypto";
import type { NeonLeaseSql } from "./neon-fenced-lease-provider";

const sha256 = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");

export async function verifyHostedCanonArchive(db: NeonLeaseSql, role: string, manifest: string, pin: string) {
  if (!/^[a-f0-9]{64}$/.test(pin) || sha256(manifest) !== pin) throw new Error("Canon archive manifest pin mismatch.");
  const documents: unknown = JSON.parse(manifest)?.documents;
  if (!Array.isArray(documents) || documents.length < 16 || documents.length > 100 || documents.some(doc =>
    !doc || !/^PPS-\d{3,4}$/.test(doc.id) || !/^[a-f0-9]{64}$/.test(doc.sha256)) ||
    new Set(documents.map(doc => doc.id)).size !== documents.length) throw new Error("Invalid pinned Canon manifest.");
  for (let id = 0; id <= 15; id++) {
    if (!documents.some(doc => doc.id === `PPS-${String(id).padStart(3, "0")}`)) throw new Error("Pinned core Canon is incomplete.");
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(role) || role === "pbos_runner_owner") throw new Error("Scoped archive reader role required.");
  const identity = await db.query<{ permitted: boolean }>(`SELECT (
    current_user::text = $1 AND current_database() = 'pbos_runner'
    AND current_setting('transaction_read_only') = 'on'
    AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls))
    AND NOT has_table_privilege(current_user, 'pbos_runner.canon_document_archive', 'UPDATE,INSERT,DELETE,TRUNCATE,TRIGGER')
    AND NOT has_any_column_privilege(current_user, 'pbos_runner.canon_document_archive', 'INSERT,UPDATE')
    AND NOT has_schema_privilege(current_user, 'pbos_runner', 'CREATE')
    AND NOT pg_has_role(current_user, 'pbos_runner_owner', 'MEMBER')
  ) AS permitted`, [role]);
  if (identity.rows.length !== 1 || identity.rows[0].permitted !== true) throw new Error("Archive reader authority is not read-only.");

  const expected = new Set<string>(documents.map(doc => doc.sha256));
  const result = await db.query<{ content_sha256: string; content_text: string }>(`SELECT content_sha256::text AS content_sha256, content_text
    FROM pbos_runner.canon_document_archive
    WHERE content_sha256::text = ANY($1::text[])
    AND octet_length(content_text) <= 262144
    LIMIT 101`, [[...expected]]);
  if (result.rows.length > 100) throw new Error("Pinned archive match exceeds its verification bound.");
  const present = new Set<string>();
  for (const row of result.rows) {
    if (!expected.has(row.content_sha256) || typeof row.content_text !== "string" || sha256(row.content_text) !== row.content_sha256) {
      throw new Error("Pinned archive content hash mismatch.");
    }
    present.add(row.content_sha256);
  }
  if (present.size !== expected.size) throw new Error("One or more pinned PPS documents are missing from the archive.");
  return { manifestSha256: pin, verifiedDocuments: documents.length };
}
