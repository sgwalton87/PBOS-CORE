# CIP-045 Playbook Production Connector Activation

## Status

LIVE STAGING ACTIVATED — RECOVERY, GOVERNED LIFECYCLE, AND CREDENTIAL ROTATION PROVEN — FINAL EVIDENCE ASSEMBLY PENDING

## Boundaries

- PBOS Core owns connector contracts, runtime governance, durable integration state, and evidence requirements.
- Playbook Platform owns Supabase authentication, Scholar workflows, user experience, data, and deployment.
- A Supabase identity is mapped into PBOS; PBOS does not become the authentication provider.
- Playbook cannot self-certify, self-authorize, merge, deploy, or issue PBOS approval.

## Canonical identities

- System: `PLAYBOOK-SYSTEM-001`
- Operating system: `PLAYBOOK-OS-001`
- Connector: `PLAYBOOK-CONNECTOR-001`
- Domain: `PLAYBOOK-DOMAIN-SCHOLAR`
- Domain registration: `PLAYBOOK-SCHOLAR-REGISTRATION-001`
- Organization: `PLAYBOOK-ORG-001`

## Activation evidence

- [x] Case-colliding documentation paths normalized in Playbook PR #46
- [ ] `@pbos/connector-sdk@1.0.0` published under the PBOS npm organization
- [ ] Exact SDK version and connector manifest installed in Playbook Platform
- [x] System registered and human-certified in live staging
- [x] Scholar domain registered and human-activated in live staging
- [x] Synthetic staging Supabase identity mapped with immutable external provenance
- [x] Capability discovery and health check completed in live staging
- [x] Scholar onboarding lifecycle event accepted in live staging
- [x] Approved dashboard projection exchange accepted in live staging
- [x] Self-certification denied in the PBOS reference activation harness
- [x] Revoked authority denied across process restart in the PBOS reference activation harness
- [x] Durable activation recovered after restart in both the PBOS reference harness and live Cloud Run staging
- [x] Governed suspension denied runtime communication before and after a live Cloud Run revision replacement
- [x] Approved resume restored active authority and healthy runtime communication
- [x] Retired staging credential denied and replacement credential accepted after Cloud Run revision replacement
- [x] Dependency failure reported without bypassing governance in the PBOS reference activation harness
- [x] Application connector typecheck, 316 tests, lint, and production build pass — human operator validation, 2026-08-04
- [x] PBOS Core typecheck, tests, and build pass — human operator validation, 2026-08-04
- [ ] Repository revision, CI URLs, runtime audit, approvals, and operator evidence collected
- [ ] Human connector certification issued

## Live staging transaction evidence

- Runtime revision: `pbos-v1-integration-staging-adae599`
- Runtime image: `sha256:b5ad74855427086b3a6560e7560f744ad615d6aa15e41045301d07783eac0a70`
- Synthetic identity: `pbos-staging-scholar-001`
- Identity mapping: `PLAYBOOK-IDENTITY-pbos-staging-scholar-001`
- Health correlation: `playbook-staging-20260804130641397-health`
- Scholar onboarding correlation: `playbook-staging-20260804130641397-onboarding`
- Dashboard exchange correlation: `playbook-staging-20260804130641397-dashboard`
- Exchange approval: `PBOS-EXCHANGE-PLAYBOOK-STAGING-20260804-001`
- Activation exit code: `0`
- Credential handling: Secret Manager bootstrap retrieved to a mode-`0600` temporary file and removed immediately after execution; no signing secret appeared in activation output
- Audit result: health, lifecycle, and private data exchange each recorded a `RESPONDED` event with connector, domain, identity, and external-identity provenance
- Recovery revision: `pbos-v1-integration-staging-recovery1`, serving 100% of traffic with `Ready`, `ConfigurationsReady`, and `RoutesReady` true
- Recovery result: connector `ACTIVE`, certification `CERTIFIED`, Scholar domain `ACTIVE`, and all `3` original audit events recovered without replaying an activation mutation
- Recovery correlation: `playbook-recovery-20260804131632628`
- Recovery verifier exit code: `0`; temporary bootstrap cleanup completed
- Suspension evidence: `PLAYBOOK-SUSPENSION-20260804-001`; connector entered `SUSPENDED`
- Denial evidence: `PLAYBOOK-DENIAL-20260804-001`; runtime communication returned `AUTHORITY_DENIED` before and after revision replacement
- Suspended-state recovery revision: `pbos-v1-integration-staging-suspended1`, serving 100% of traffic with all service readiness conditions true
- Resume evidence: `PLAYBOOK-RESUME-20260804-001`; connector returned to `ACTIVE`
- Resume health correlation: `playbook-resume-health-20260804132350349`; output reported `healthy: true` with identity, connector, and registration provenance
- Governed lifecycle proof and enclosing workflow exit codes: `0`; temporary bootstrap cleanup completed
- Credential rotation revision: `pbos-v1-integration-staging-rotate134124`, serving 100% of traffic
- Credential rotation result: retired credential denied, replacement credential completed governed health, protected Secret Manager versions enabled, and workflow exited `0`
- Credential rotation evidence: `PLAYBOOK-CREDENTIAL-ROTATION-20260804-001`

## Validation gate

PBOS Core operator:

```bash
npm run typecheck
npm run test:run
npm run build
```

Playbook operator, after the application-side connector PR exists:

```bash
npm ci
npm run typecheck
npm run test:run
npm run build
```

Passing commands prepare evidence; they do not merge, deploy, or certify automatically.

## Deferred registry action

The PBOS npm organization and first SDK publication are intentionally deferred by the owner. This does not authorize a personal-scope substitute or an unversioned repository dependency. Application-side installation resumes only after `@pbos/connector-sdk@1.0.0` is available from the approved registry.

## Application repository evidence

- Repository: `sgwalton87/playbook-platform`
- Pull request: `#47`
- Connector revision validated: `aa94b6df7b6772a825e4370022389136e99e288d`
- Merge revision: `596bc1471c0a483de4e3d99625f3425a66df6426`
- Merged: 2026-08-04
- Prepared operations: capability discovery, Scholar onboarding lifecycle publication, and approved private dashboard projection

The application tests prove request construction, idempotency, and missing-approval denial. They do not replace live evidence against a deployed PBOS v1 service.
