# Historical Genesis production event duplicates — non-destructive recovery runbook

Status: DRAFT / PREPARATION ONLY — NOT EXECUTED
Date: 2026-11-20
Scope: three reported historical duplicate production-event sequences in the **original Mac-hosted Genesis state**.
Authority: PBS-KRN-007; PPS-009; PPS-011; PPS-012; PPS-2002
Implementation inspected: `pbos/genesis-state/genesis-state-repository.ts` (`appendProductionEvent` uses a locked maximum + 1 and preserves legacy duplicates).

## Hard boundary
This repository change does **not** inspect or mutate the operator's original Mac, `PBOS_STATE_HOME`, production credentials, user records, event history, leases, grants, or autonomous authority. Do not remotely infer the local state-file path. Do not run recovery against Cloud Run or a preview environment and call it Mac recovery.

## Stage A — separately authorized READ-ONLY discovery on the Mac
1. Operator identifies the real PBOS process, effective `PBOS_STATE_HOME`, durable store file(s), repository revision, running process/lease state and current backup policy. Record filenames and hashes, but never paste secrets into tickets.
2. Pause writers **only after** separate operator approval; first capture read-only process/service diagnostics. Never kill active operator work speculatively.
3. Obtain an immutable byte-for-byte snapshot plus a separately verified restorable backup. Capture SHA-256, file size, permissions, snapshot timestamp and custody log. No JSON rewriting during evidence acquisition.
4. On a **copy only**, parse `productionEvents` preserving original array offsets and all original event bodies. Group by `sequence` globally and by `runId`; also check `eventId` identity collisions. Distinguish repeated sequence from repeated identity and from intentionally distinct domain events.
5. Expect exactly three *reported duplicate cases*, but treat their actual count, identities and impact as UNKNOWN until discovery. Stop if counts differ, source lacks intact JSON, or event lineage is ambiguous.
6. Trace all consumers that assume a strictly increasing sequence; inspect correlated `productionRuns`, `productionStages`, `productionRecoveryEpochs`, audit records and external side effects. Never replay external effects as a side effect of analysis.

## Stage B — isolated deterministic proof
1. Build a synthetic fixture reproducing the *discovered shape*, without copying protected payloads.
2. Assert every existing `eventId`, timestamp, run linkage, payload hash and original array order is unchanged.
3. Compare two remedies without modifying authoritative history: (a) stable playback ordering using `sequence` then original append offset, and (b) a versioned sidecar mapping duplicate source offsets to presentation ordinals. Prefer additive interpretation over renumbering historical source events.
4. Run existing Genesis and production runtime tests plus replay/idempotency tests. Verify consumers cannot silently collapse distinct events; verify new appends still allocate monotonically beyond the stored maximum under concurrent writers.
5. Produce before/after logical traces, risk assessment, exact rollback instructions, synthetic test results and a signed review package.

## Stage C — explicit decision and controlled change (NOT AUTHORIZED HERE)
- Require written operator approval specifying host, snapshot hash, exact file, proposed patch hash, permitted downtime, execution actor, rollback trigger and whether change is interpretation-only or data-writing.
- If a historical data rewrite is ever proposed, obtain a separate higher-risk approval; preserve the original immutable history and reversible mapping, never delete or silently replace events.
- Execute a dry-run on a copied snapshot first. Restore-test the backup. Only after independent certification and approval can a supervised runtime change be considered.
- Reconcile every source event exactly once; compare event counts, IDs, payload hashes, sequence collision report, lease state and service health. Keep an audit trail.
- On any discrepancy, STOP and restore from the verified snapshot under the approved rollback procedure.

## Evidence / closure
Required: original snapshot hash, duplicate event identity+offset report (redacted), consumer impact map, synthetic fixture and test results, independent reviewer sign-off, separate Mac operator authorization, rollback drill and postchange integrity attestation. Until then: `GENESIS_HISTORICAL_EVENT_RECOVERY=BLOCKED_AWAITING_MAC_READ_ONLY_DISCOVERY_AND_APPROVAL`.

## Important design note
`productionEvents()` sorts only by `sequence` today; equal historical sequences need a separately validated deterministic playback contract. The present append method intentionally does not rewrite old events. A "fix" that just renumbers all existing events is not approved.
