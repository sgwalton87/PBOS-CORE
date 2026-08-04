# PBOS-CIP-032 Certification

## Status

CERTIFIED

## Partner-Ready CLI Distribution

The package exposes the `pbos` executable. `pbos login` requires authenticated GitHub access and enrolls an organization-scoped PBOS operator. `pbos status` reports the active organization, GitHub account, and operator. `pbos` launches intake or a registered-system workflow and can prepare Bulletproof on a governed branch with a draft pull request.

## Operator Installation

```bash
npm ci
npm link
pbos login
pbos
```

## Protected Gates

Validation execution, merge, certification, production deployment, secret changes, destructive migrations, and cross-repository expansion retain explicit human approval requirements.
