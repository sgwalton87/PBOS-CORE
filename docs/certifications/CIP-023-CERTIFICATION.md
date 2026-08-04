# PBOS-CIP-023 Certification

## Status

READY FOR CERTIFICATION

## Title

Genesis Terminal Control Plane

## Scope

- Single `npm run pbos` entrypoint
- Registered-system discovery and selection
- Playbook Platform and Bulletproof Beneficiary reference systems
- Authority-mode selection
- Operator-confirmed build-session activation
- Real bounded authority grant issuance
- System and repository isolation

## Terminal Outcome

The terminal is the operator-facing precursor to the PBOS Marketplace / Factory Portal. Both interfaces will use the same Genesis control-plane contracts.

## Validation Commands Ready

```bash
npm run typecheck
npm test
npm run build
```
