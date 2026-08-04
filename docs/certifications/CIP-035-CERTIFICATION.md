# PBOS-CIP-035 Certification

## Status

READY FOR CERTIFICATION

## Guided Continuous Operator Session

The Genesis terminal no longer exits after a single workflow action. Within one authenticated and authorized session, the operator can move through repository inspection, build planning, application preparation, draft pull request creation, validation evidence collection, remediation, and certification readiness.

After every completed action PBOS displays the recommended next action and returns to the workflow menu. The session ends only when the operator chooses **Exit**, submits the default blank exit response, encounters a governed blocker, or the grant fails authorization.

## Tests Prepared

- Complete plan → build → validation → exit sequence in one terminal launch
- Menu continuation after every stage
- Certification-readiness presentation
- Existing authority and system-selection regression coverage

## Validation Commands Ready

```bash
npm run typecheck
npm test
npm run build
```
