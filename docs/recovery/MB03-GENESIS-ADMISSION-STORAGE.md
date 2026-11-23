# MB-03 staging admission storage

## Verified failure

Cloud Run execution `pbos-genesis-admission-p7rd2` ran image source
`f5aa816dd56fc49485ef568939340ae64ca1dc1a`. Its structured
`MB03_HOSTED_ADMISSION_OBSERVATION` logged `BLOCKED`,
`stateDirectorySecure=false`, `canonicalInspection=null`, and
`missionExecutionAuthorized=false`; the container exited 2. The staging
job set `PBOS_STATE_HOME=/var/lib/pbos` and mounted only the operator public
key. The failure occurred before file, identity, or integrity checks.

The original local state SHA-256 remains
`64bfc02e56784dab980186daf5589ef3c8ac9b81695583942e282c0b43e7a070`.
It authenticates the existing operator but fails integrity on three historical
event-sequence collisions. The previously audited copy-only repair has state
SHA-256 `a4aa7f40d62f1d114107d3a6164f49b0883e871c74bab3072c3bac8334b289d5`
and retains all 2,627 events and 38 runs. Its state lineage requires independent
approval before staging use. The earlier local recovery directory contains
symlinked identity files and cannot be mounted as an observation snapshot.
The exact derivative passed the current runtime integrity verifier with zero
active leases. Neither the original nor the derivative contains the two
MB-03 mission IDs in its queue.

Neon still has zero canonical-state rows. Its existing execution lease, nonce,
and checkpoint functions serve a different runtime purpose. The PPS archive
is used separately for Canon verification.

## Protected snapshot publication and rollback

1. An authorized operator and independent reviewer approve the exact copy-only
   event repair, the source and staging digests, and the release of the minimum
   identity files to this staging job. Identity files contain legacy credential
   material. Keep them out of Git, CI artifacts, and issue comments. Retain the
   untouched originals, repair mapping, file hashes, and private review evidence.
2. Under operator custody prepare three regular, private files. Use the original
   identity records and the approved state derivative. Run the existing read-only
   preflight before transfer and confirm authentication, integrity, stable bytes,
   and no active run or lease. Reject symlinks, fixtures, and unapproved state.
3. Compute the state-set pin as SHA-256 of the ASCII lowercase SHA-256 hashes of
   `profile.json`, `operators.json`, and `genesis-state.json`, one hash per
   line in that order, with a final newline. Use the separately approved
   `mb03-admission/<pin>/` managed folder in the dedicated
   `pbos-genesis-staging-mb03-observation-state` bucket. The dedicated bucket
   enforces public access prevention, uniform bucket-level access, and object
   versioning. The shared state bucket has legacy read grants for project
   Viewers, so keep the observation snapshot in the dedicated bucket. Verify
   encryption at rest and effective IAM including project grants before any
   transfer. Give the staging executor read access only to the approved prefix.
   The staging project also grants object access through Cloud Build, Container
   Registry, and Cloud Run service roles. Removing bucket-level convenience
   grants does not remove these inherited permissions. Keep the bucket empty
   until a separately reviewed control restricts effective access and a bucket
   administrator reads back the policy. Provisioning alone does not qualify
   this destination for cleartext credential files.
   Record provider object generations and verify the uploaded bytes from the
   operator boundary. Upload create-only and preserve the previous generation.
4. Set protected staging variable `MB03_GENESIS_STATE_SET_SHA256` to the
   independently reviewed pin. Dispatch the existing workflow on reviewed
   `main` with `confirm_staging_only=DEPLOY-STAGING-ADMISSION` and
   `bind_genesis_state=true`. This is a separately approved operation. The
   observer remains the default entrypoint. The workflow uses a read-only GCS
   FUSE mount with UID/GID 1000, directory mode 500, and file mode 400, then
   verifies the exact mount and protected binding references. Verify folder-only
   IAM works with the live mount before considering broadening access.
5. After independent staging approval, run just the read-only observer. Verify
   the exact deployed image digest and runtime identity, unchanged objects and
   source bytes, and an output stating `READY_FOR_SEPARATE_SIGNED_APPROVAL` with
   `missionExecutionAuthorized=false`. The observer alone does not attest the
   host or enable mission dispatch. Run `--verify-bindings` and
   `--verify-canon-archive` separately under their authorized read-only scope.
6. If validation fails, stop the observation and preserve the failing receipt.
   Restore the preceding reviewed deployment configuration, or detach the
   observation mount and remove its pin together through a separate authorized
   deployment. Revoke only the new scoped grant if rollback requires it. Keep
   the authoritative local state and versioned evidence. An approved change of
   pin is an explicit migration, not an in-place workflow retry.

## Separate mission prerequisites

The existing unsigned proposal packages are review inputs for the following
staging files in `sgwalton87/playbook-platform`. Both were generated on the
earlier Playbook base `cb20dbbf75a875f6fb770d6228d272e75ad43ed0`.

| Mission | Expected change | Exact proposal file |
| --- | --- | --- |
| MB03-MISSION-001 | Isolated QA checklist documentation | `docs/pbos-missions/MB03-MISSION-001.md` |
| MB03-MISSION-002 | RCC-010 proposal evidence documentation | `docs/pbos-missions/MB03-MISSION-002.md` |

The queue and the exact current Canon lineage must be reconciled before
requesting signatures. The disposable executor state and its writable storage
require separate review. If an attempt fails, retain its nonce, fence, and
durable checkpoints, reconcile any draft PR under its usual review controls,
and obtain separate recovery authority before another write.

For each reviewed MB03 mission, retain the exact Playbook commit, PPS manifest
pin, generated proposal provenance, permitted branch and file, exact content
digest, verified operator identity, and private approval evidence. Any later
Canon or proposal change needs scope reconciliation and review before signing.
Independently verify the host, signed input, nonce, lease fence, durable
checkpoint, and draft PR evidence. A read-only observation mount cannot serve
as the mutation store for the hosted executor. Mission 002 also requires
interruption, replay, and stale-fence verification. Never infer certification
or reuse mission authority from the observer receipt.
