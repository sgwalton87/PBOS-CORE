# PBOS-CIP-033 Certification

## Status

CERTIFIED

## Automatic Validation Evidence and Resumable Remediation

PBOS now collects GitHub Actions check results and failed-job logs directly from an application pull request, binds evidence to its head commit, persists remediation state across terminal processes, applies registered deterministic repairs under the active build grant, pushes a new revision, and resumes evidence collection when checks rerun.

## Safety Boundaries

- PBOS does not execute the operator-controlled local validation commands.
- GitHub Actions performs application validation from the draft pull request.
- Repository remediation requires active mutation authority for the selected system, repository, and `agent/*` branch.
- Attempts are bounded.
- An identical repeated failure blocks instead of looping.
- Certification and merge remain explicit human approvals.

## Operator Flow

Select **Collect validation evidence and resume remediation**. Existing PR #1 can be adopted when no durable validation run exists. PBOS then reports one of:

- `WAITING_FOR_CHECKS`
- `REMEDIATION_PUSHED`
- `READY_FOR_CERTIFICATION`
- `BLOCKED`

## Validation Commands Ready

```bash
npm run typecheck
npm test -- --run
npm run build
```

## Certification Evidence

- Certification date: 2026-08-04
- `npm run typecheck`: PASS
- `npm test`: PASS — 64 test files, 202 tests
- `npm run build`: PASS
- Human-operated validation gate completed before promotion
