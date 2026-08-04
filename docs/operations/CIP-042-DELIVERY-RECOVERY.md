# CIP-042 Delivery Recovery Runbook

## Operating rules

- Every delivery has an organization, connector, operation, and idempotency key.
- Retryable failures use bounded exponential backoff with jitter.
- Terminal failures and exhausted retries enter the dead-letter state.
- Dead-letter replay requires a named actor and PBOS approval.
- Delivered records are not executed again after restart.
- Open circuits and dead letters place integration health in a degraded state.

## Dead-letter response

1. Identify the delivery, connector, correlation evidence, failure class, and payload classification.
2. Correct the underlying dependency, schema, authority, or application problem.
3. Confirm replay will not duplicate an external side effect.
4. Obtain explicit replay approval.
5. Call `replay(deliveryId, approvalId, actorId, authority)`.
6. Resume delivery and collect resulting evidence.
7. Escalate repeated identical failures rather than extending retry limits.

## Circuit response

1. Treat an open circuit as dependency protection, not an error to bypass.
2. Inspect dependency health and pending/dead-letter counts.
3. Allow the configured recovery interval to pass.
4. Probe through the normal delivery path.
5. Reopen traffic only after successful delivery evidence.
