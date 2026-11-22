# MB-03 — No-Backup Recovery Decision Record

Status: **CONTINGENCY ONLY — NOT AUTHORIZED / NOT EXECUTED**

## Why this exists
The recovered Neon runner has zero canonical Genesis state records and zero mission checkpoints. A Drive search did not locate a verified original Genesis backup. Neither finding proves that all original copies are lost. The canonical repository currently persists operator-private state in `$PBOS_STATE_HOME`, including `genesis-state.json`, `operators.json`, and `profile.json`.

## Recovery order (non-destructive)
1. Search existing original host, user backup, attached volumes, historical runner volumes, and permitted encrypted archives for the three operator-private files. Never expose credentials, signing keys or state JSON in logs or pull requests.
2. On each candidate, run the existing read-only `pbos:preflight:readonly` integrity/identity check. Preserve candidate hashes and provenance without uploading private contents.
3. If a valid original is located, use a separately reviewed, encrypted migration with rollback and explicit operator authorization. Do not substitute the empty Neon `canonical_state` table as proof of continuity.
4. If no original is recoverable, mark the original authority chain **LOST / UNVERIFIED**, archive the evidence of that determination, and initiate a **new genesis epoch** through a separately approved governance process. Never relabel a new epoch as the original.
5. New operator enrollment, new signing keys, new grants and new mission approvals must be freshly issued in the new epoch. Old signatures cannot be recreated; prior mission certification is not inherited. Reconstruct mission planning only from verifiable GitHub, CI, deployment and repository evidence.
6. Execute two distinct remote missions with new signed approvals, worker logs, durable checkpoints, independent CI evidence and separate certification. No production secrets, destructive migrations or merges without their protected approvals.

## Safety boundary
This record is not permission to create Genesis state, enroll an operator, rotate credentials, deploy a worker, merge code, or certify MB-03. Missing state must block autonomous mission execution until a verified original is restored or a separately authorized new epoch is established.

## Current evidence
- Neon project: `patient-truth-44204591` (recovered).
- `pbos_runner.canonical_state`: 0 rows.
- `pbos_runner.mission_checkpoint`: 0 rows.
- Existing `pbos_runner.execution_lease` smoke tests passed acquisition, renewal, release, ownership and monotonic fencing.
- Recovery preflight / lease code: draft PR #116.
- MB-03 issue #95: **0/2 independently certified remote missions**.

## Exit criteria
A reviewer can identify the actual canonical source, verify its integrity and authority, and confirm a persistent hosted executor; or a documented no-backup determination plus separately authorized new Genesis epoch is recorded. No inferred authority.
