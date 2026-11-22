# PBOS Cloud Runner — deployment gate

**Target:** isolated non-production PostgreSQL database, not the existing Playbook OS or Bulletproof databases.

## Implementation in this PR
- `isolated-postgres.sql` defines an encrypted canonical-state slot, mission checkpoints, and an atomic per-resource lease with monotonically increasing fencing tokens.
- `scripts/cloud-runner-state-guard.cjs` refuses unpinned, missing, unsafe, or ephemeral Genesis state. It **never** authorizes a mission by itself.
- Cloud CI runs source validation without a production token or PBOS operator identity.

## Required deployment order
1. Provision a dedicated non-production database and private runtime identity. Do not reuse Playbook application data.
2. Verify the existing canonical operator state on its original host and record its SHA-256 fingerprint. Founder must approve any encrypted export/migration; never synthesize Genesis state.
3. Apply the SQL to the isolated database; create a private least-privilege role with no `anon`/`authenticated` grants. Store encryption keys outside the database.
4. Encrypt the original state at the application layer and import it once with expected fingerprint and audit evidence. The schema intentionally has no automatic Genesis initializer.
5. Implement a runner adapter that acquires a lease, verifies its fencing token before **every** state mutation, persists checkpoints, and refuses to proceed after lease expiry.
6. Resolve PBOS's existing signed mission grant and exact Playbook repository target; run only a bounded non-production mission. Create a **draft PR**, run checks, capture preview and evidence. Merge and production deployment remain human gated.

## Stop conditions
- Missing original state or fingerprint mismatch.
- No isolated database, secret store, or durable state backup.
- No fenced lease and atomic version-checked state commit.
- No existing signed PBOS mission grant.
- Any request to modify Playbook production data or automatically merge.

**Not yet delivered:** hosted runner process, durable DB connection, state migration, distributed-lease integration with the CLI, or PBOS-generated Playbook PR. These cannot be claimed from a schema commit.
