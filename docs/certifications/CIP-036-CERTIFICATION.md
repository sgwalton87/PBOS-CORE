# PBOS-CIP-036 Certification

## Status

READY FOR CERTIFICATION

## Operator Briefing, Session Continuity, and Background Monitoring

CIP-036 turns the Genesis terminal into a continuous operating console. Repository operations emit live stage events. Exiting produces a durable Markdown session memo and summary. Unfinished validation runs are announced on the next launch. Operators can retrieve the latest memo with `pbos memo` and inspect background state with `pbos status`.

When an unfinished validation run exists, the operator is explicitly asked whether PBOS should continue monitoring after exit. Approval launches a detached process that collects GitHub Actions evidence, applies authorized remediation packs, writes updated memos, and stops at `READY_FOR_CERTIFICATION`, `BLOCKED`, the polling ceiling, grant revocation, or grant expiration.

## Safety Boundaries

- Background work is opt-in per exit.
- The existing durable grant controls every repository mutation.
- Certification, merge, production deployment, secrets, destructive migrations, and cross-repository work remain protected.
- Polling is bounded and failures are written to an operator-owned log.
- A stopped process can resume from durable state.

## Tests Prepared

- Durable session memo generation
- Memo retrieval by system
- Background resumption from stored session state
- Certification-readiness memo output
- Existing guided-session and authority regression coverage

## Validation Commands Ready

```bash
npm run typecheck
npm test
npm run build
```
