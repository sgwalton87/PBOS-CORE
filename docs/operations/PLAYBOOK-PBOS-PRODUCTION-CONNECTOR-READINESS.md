# Playbook ↔ PBOS production connector readiness (Issue #79)

**State: BLOCKED — production authority not verified.** This is an operator checklist, not an authorization or deployment receipt.

## Current verified boundary
- The deployed integration described by CIP-047 is **staging**, in `pbos-genesis-staging`, `us-west1`, service `pbos-v1-integration-staging`.
- The Playbook Vercel project currently has fourteen `PBOS_*` variables scoped to Preview only; none to Production.
- In production, Playbook's governed message publishing checks `PBOS_MESSAGING_JOURNEY_APPROVAL_ID` before attempting the signed PBOS request. The missing setting fails closed. Other PBOS endpoint and connector credentials are also missing, so adding only the journey ID is insufficient.
- The acceptance approval defined by `pbos/genesis-console/functional-acceptance-authority.ts` is scoped to a synthetic staging journey and expressly excludes production.
- Issue #79 tracks the production blocker. Playbook QA-082 and QA-083 record the evidence.

## Protected production-provisioning gates

### Gate A — discover and decide
- [ ] Operator checks for an existing separately authorized PBOS production service, production project, domain, organization, connector and authority registry. Record evidence references, not secret values.
- [ ] If none exists, operator explicitly approves a distinct production environment and its isolation, capacity, billing, ownership and rollback plan. **No reuse of staging keys, trust bundles, approvals or state.**
- [ ] Confirm immutable runtime build, durable state and recovery design, network ingress/TLS, IAM identity and rotation procedures.

### Gate B — PBOS-governed identity and trust
- [ ] Authorized operator issues an expressly production-scoped Playbook connector identity for the intended tenant, operation scopes and signing key.
- [ ] Store secret bytes only in approved secret manager / Vercel secret settings; never in GitHub issues, CI logs, docs, screenshots or command center.
- [ ] Establish a separately approved production `authorized-support messaging` journey authority. Approval ID and issuer must be valid for actual production scope, not synthetic staging acceptance.
- [ ] Audit and store non-secret evidence of authority scope, expiry, key rotation and revocation.

### Gate C — runtime certification before linking real users
- [ ] `GET /health` responds 200 for a pinned production revision.
- [ ] Unsigned `POST /pbos/v1` is denied (401); wrong tenant, expired/rotated key, unapproved journey and replay are rejected.
- [ ] Authorized **non-user-data** signed health probe succeeds, with correlation and audit lineage.
- [ ] Durable state survives a controlled revision restart; observability and alerting are ready.
- [ ] Last-known-good immutable image and rollback procedure are captured and explicitly authorized.

### Gate D — Playbook Vercel production handoff
- [ ] Verify the approved production endpoint, organization ID, connector ID, key ID, secret, environment and journey approvals using the production authority registry.
- [ ] Set the necessary `PBOS_*` environment variables **Production only**. Preserve existing Preview variables separately.
- [ ] Deploy the exact approved Playbook commit. Check Ready, domain alias and owner-scoped route health.
- [ ] Use two opted-in test accounts: accepted Scholar/Parent relationship, valid signed message publish, recipient view/reply, persistence after reload, and avatar-to-thread navigation.
- [ ] Verify unauthorized/nonlinked users cannot publish/read messages.
- [ ] Record actual production IDs and redacted test evidence in the Playbook QA Command Center. Close #79 only when all gates are genuinely proven.

## Non-regression rules
1. Never synthesize or reuse a production approval identifier.
2. Never disable HMAC, consent, relationship, audit, classification or access gates to bypass configuration errors.
3. Never claim that a rendered conversation, staging test or HTTP 200 health proves real message delivery.
4. Leave current Playbook Production intact while PBOS authority is missing. No traffic, IAM, secret or durable-state mutation is authorized by this document.
5. Do not record passwords, private invitation codes, personal email contents or signing keys in public evidence.

## References
- `pbos/api/README.md`
- `docs/security/CIP-039-CONNECTOR-TRUST-THREAT-MODEL.md`
- `docs/operations/CIP-047-CLOUD-RUN-STAGING.md`
- `docs/operations/CIP-047-RUNTIME-OPERATIONS-RUNBOOK.md`
- `pbos/genesis-console/functional-acceptance-authority.ts`
- https://github.com/sgwalton87/PBOS-CORE/issues/79
