# CIP-038 Integration State Backup and Recovery

## Scope

This runbook applies to the file-backed PBOS Integration Layer state containing tenant-scoped connectors, domains, identity mappings, runtime events, revocations, and idempotency records.

## Storage requirements

- Store the production state file outside the source repository.
- Restrict the state directory to the PBOS service account.
- Files are written atomically with owner-only permissions.
- Keep backups encrypted using the approved platform backup service.
- Never edit a production state file manually.

## Backup procedure

1. Resolve the exact production state path and approved backup destination.
2. Record current schema version and revision.
3. Call `FileIntegrationStateRepository.backup(targetPath)` with a new destination; existing backups are never overwritten.
4. Hash and encrypt the backup using the deployment platform controls.
5. Record revision, hash, timestamp, operator, approval, retention class, and storage location in the audit ledger.
6. Perform a scheduled restore rehearsal in an isolated environment.

## Restore procedure

1. Declare the incident or approved recovery exercise.
2. Stop integration mutations while preserving read-only diagnostic access.
3. Verify backup hash, encryption identity, schema version, revision, and approval.
4. Copy the current production file to a separate incident-preservation location.
5. Call `FileIntegrationStateRepository.restore(backupPath)`.
6. Restart the PBOS integration service.
7. Verify connector certification, domain activation, identity mappings, revocations, idempotency records, and event lineage.
8. Run connector health checks for Playbook and Bulletproof.
9. Resume mutations only after named human approval.
10. Append recovery evidence to the audit and certification ledgers.

## Rollback and failure behavior

- Unsupported future schemas fail closed.
- Missing migration steps fail closed.
- Stale revisions fail without overwriting the winning write.
- Mutation locks time out rather than proceeding concurrently without protection.
- Revocations remain authoritative across process restarts.
- A failed restore must preserve both the attempted backup and the pre-restore production copy for investigation.

## Validation evidence required

- Restart persistence test
- Tenant-isolation test
- Stale-revision conflict test
- Cross-process revocation test
- Forward-migration test
- Idempotency-conflict test
- Backup-and-restore test
