# CIP-045 Playbook Production Connector Activation

## Status

PBOS-SIDE VALIDATED — APPLICATION ACTIVATION PENDING — NOT CERTIFIED

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
- [ ] System registered and human-certified
- [ ] Scholar domain registered and human-activated
- [ ] Supabase identity mapped with immutable external provenance
- [ ] Capability discovery and health check completed
- [ ] Scholar onboarding lifecycle event accepted
- [ ] Approved dashboard projection exchange accepted
- [x] Self-certification denied in the PBOS reference activation harness
- [x] Revoked authority denied across process restart in the PBOS reference activation harness
- [x] Durable activation recovered after restart in the PBOS reference activation harness
- [x] Dependency failure reported without bypassing governance in the PBOS reference activation harness
- [ ] Application repository typecheck, tests, and build pass
- [x] PBOS Core typecheck, tests, and build pass — human operator validation, 2026-08-04
- [ ] Repository revision, CI URLs, runtime audit, approvals, and operator evidence collected
- [ ] Human connector certification issued

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
