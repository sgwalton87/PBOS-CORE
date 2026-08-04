# CIP-047 Runtime Operations Runbook

## Scope

This runbook governs the PBOS v1 staging integration services. It does not authorize production changes, destructive state operations, secret disclosure, or an exercise against real user data.

## Incident response

1. Record the incident ID, service, revision, image digest, detection source, start time, and accountable operator.
2. Confirm the health, error-rate, p95-latency, authentication-denial, request-rate, and state-durability signals.
3. Preserve logs, audit events, current state digest, traffic allocation, IAM policy, and active configuration before mutation.
4. Classify severity and affected connector organizations without copying protected payloads into the incident record.
5. Contain the incident by suspending affected connector authority or routing traffic only after the required approval.
6. Record acknowledgement, mitigation, and closure times. Confirm that audit provenance survived and no sensitive data was exposed.
7. Produce a follow-up work package for every unresolved control or recurrence risk.

## Immutable rollback

1. Identify the last certified image by its fully qualified digest; never select a mutable tag as rollback evidence.
2. Capture the durable state digest and active revision before changing traffic.
3. Deploy or route to the known-good digest only after explicit approval.
4. Confirm the new ready revision serves 100% of intended traffic, `GET /health` returns `200`, and anonymous `POST /pbos/v1` returns `401`.
5. Recompute the state digest and require byte identity with the pre-rollback digest.
6. Run the signed health transaction and the approved degraded-dependency denial check.
7. Store observations in a protected file and run `npm run pbos:evidence:runtime-rollback`.

## Disaster recovery

1. Record the recovery point objective, recovery time objective, backup generation, object version, digest, and recovery owner.
2. Restore only into an isolated recovery boundary; never overwrite active state during a proof exercise.
3. Compare backup and restored SHA-256 digests and validate connector, domain, identity, revocation, and audit-event semantics.
4. Record observed recovery-point and recovery-time results.
5. Do not promote restored state into an active service without a distinct approval and rollback plan.
6. Store the complete operational observation in a protected file and run `npm run pbos:evidence:runtime-operations`.

## Approval boundaries

Explicit human approval is required before changing Cloud Run traffic or revisions, injecting dependency failures, creating or modifying alerts and notification channels, paging people, modifying IAM, reading secrets, restoring active state, or performing any production action.

## Closure evidence

- Monitoring dashboard and alert identifiers
- Notification-channel delivery proof
- Incident timeline and owner
- Immutable before/candidate/rollback image digests
- State digests before and after the exercise
- Backup and restore evidence identifiers
- Observed RPO and RTO
- Audit/confidentiality confirmation
- Validation and certification decision
