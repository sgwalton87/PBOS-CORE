import type { NeonLeaseSql } from "./neon-fenced-lease-provider";

const REQUIRED_TABLES = ["canonical_state", "execution_lease", "mission_approval_nonce", "mission_checkpoint"];
const REQUIRED_FUNCTIONS = [
  "acquire_execution_lease(text,uuid,integer)",
  "renew_execution_lease(text,uuid,bigint,integer)",
  "release_execution_lease(text,uuid,bigint)",
  "consume_mission_approval_nonce(uuid,text,text,timestamp with time zone)",
  "commit_mission_checkpoint(text,text,text,uuid,bigint,bigint,bytea)"
];

/** Verifies role and catalog bindings without invoking any mission function. */
export async function verifyHostedNeonReadiness(db: NeonLeaseSql, expectedDatabase: string, expectedRole: string): Promise<boolean> {
  const result = await db.query<{ ready: boolean }>(`SELECT (
    current_database() = $1 AND current_user::text = $2
    AND current_setting('transaction_read_only') = 'on'
    AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls))
    AND has_schema_privilege(current_user, 'pbos_runner', 'USAGE')
    AND NOT EXISTS (SELECT 1 FROM unnest($3::text[]) AS t(name)
      WHERE to_regclass('pbos_runner.' || t.name) IS NULL)
    AND NOT EXISTS (SELECT 1 FROM unnest($4::text[]) AS f(signature)
      WHERE to_regprocedure('pbos_runner.' || f.signature) IS NULL
        OR NOT has_function_privilege(current_user, to_regprocedure('pbos_runner.' || f.signature), 'EXECUTE'))
  ) AS ready`, [expectedDatabase, expectedRole, REQUIRED_TABLES, REQUIRED_FUNCTIONS]);
  return result.rows.length === 1 && result.rows[0].ready === true;
}
