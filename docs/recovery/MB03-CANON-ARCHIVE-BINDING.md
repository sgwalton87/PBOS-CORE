# MB-03 read-only Canon archive binding

Target the existing `pbos_runner` database on Neon project `patient-truth-44204591`, branch `br-billowing-forest-ar8pwj81`. Confirm the endpoint against the branch in Neon before recording the hostname. The archive is `pbos_runner.canon_document_archive`. The archived records, operator keys, and Genesis state require separate custody.

## Administrator review

Reuse a scoped login if one exists. If none exists, have the Neon administrator approve a dedicated login with no schema ownership, no membership in `pbos_runner_owner`, no inherited writer roles, and no `CREATEROLE`, `CREATEDB`, `BYPASSRLS`, or replication privileges. Limit grants to `CONNECT` on `pbos_runner`, `USAGE` on schema `pbos_runner`, and `SELECT (content_sha256, content_text)` on `pbos_runner.canon_document_archive`. Review effective grants, including `PUBLIC`. The verifier rejects archive mutation privileges and sets its transactions read-only. Preserve current grants for other identities. No grants are applied by CI.

Store the connection for that role under a dedicated numbered Secret Manager reference in `pbos-genesis-staging`. Grant `roles/secretmanager.secretAccessor` on that secret only to `pbos-genesis-executor@pbos-genesis-staging.iam.gserviceaccount.com`. The execution connection uses a separate secret and role. Populate the protected `pbos-genesis-staging` GitHub environment with the non-secret references and pins below.

| Variable | Value |
| --- | --- |
| `MB03_ARCHIVE_NEON_SECRET_VERSION` | Approved Secret Manager `name:number` |
| `MB03_ARCHIVE_NEON_HOST` | Exact approved endpoint hostname for the branch |
| `MB03_ARCHIVE_NEON_ROLE` | Approved scoped archive login |
| `MB03_ARCHIVE_PPS_SOURCE_SHA` | `cb20dbbf75a875f6fb770d6228d272e75ad43ed0` |
| `MB03_ARCHIVE_PPS_MANIFEST_SHA256` | `54fc93d82f5b5b39584776b3b92ba3949f927425d3ee05505803d63b9957b68b` |

After independent review and protected staging deployment approval, enable `bind_canon_archive` for the reviewed workflow dispatch. The deployment retains the admission observer as the default command. A separately authorized run can invoke `./node_modules/.bin/tsx pbos/tools/mb03-hosted-executor.ts --verify-canon-archive` on that Cloud Run job. The command checks the workload identity, retrieves the public pinned manifest, and hashes the matching archived bytes. A passing result reports the verified manifest digest and document count, with no archived text or credentials in its output. Hash matching verifies the pinned snapshot content. It does not promote any archive entry or qualify the mission executor.
