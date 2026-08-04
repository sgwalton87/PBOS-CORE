# Delegated Autonomous Build Authority

PBOS Genesis issues time-bound build grants to PBOS v1 after one explicit operator approval. Grants restrict the system, repository, branch pattern, actions, risk ceiling, and duration. Every authorization decision is recorded in an audit ledger and grants can be revoked immediately.

Modes:

- `READ_ONLY` permits inspection, status, and planning.
- `HUMAN_GATED` requires explicit approval for each mutating action.
- `DELEGATED_AUTONOMY` permits routine implementation within the grant.

Protected actions always require explicit approval. Under the current controlled validation policy, Genesis prepares tests but the operator executes typecheck, tests, and builds manually.
