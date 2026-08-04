# PBOS Integration Layer — 100% Completion Roadmap

## Objective

Move the PBOS Integration Layer from certified architecture to a durable, authenticated, deployable, observable, multi-application operating boundary.

The layer is 100% only when both Playbook Platform and Bulletproof Beneficiary can independently register, authenticate, activate a domain, map identities, discover capabilities, communicate with PBOS v1, recover from failures, and produce certification evidence without importing application logic into PBOS Core.

## Current baseline

### Complete

- Connector, domain, capability, identity, authority, communication, and provenance contracts
- Fail-closed registration, certification, activation, identity mapping, and health communication
- Provider-neutral connector SDK and HTTP transport
- PBOS v1 API and Node HTTP adapter
- Playbook and Bulletproof reference identities
- Persistent Genesis operator, grant, session, audit, and remediation state
- GitHub repository gateway, build planning, scaffold generation, validation collection, and resumable remediation
- Human-controlled certification and promotion gates

### Remaining production gaps

- Integration registries and runtime event history are process-local
- Transport has no production authentication, request signing, replay protection, or rate limiting
- API supports health checks but not lifecycle events, intelligence requests, approved data exchange, capability discovery, status, suspension, revocation, or version negotiation
- Request payloads are compile-time types rather than runtime-validated versioned schemas
- Connector SDK is not independently packaged, versioned, published, or conformance-tested
- No production service host, deployment manifest, secrets binding, environment promotion, or rollback procedure
- No standard metrics, traces, alerts, dead-letter handling, retry policy, or service-level objectives
- Playbook and Bulletproof lack complete end-to-end connector evidence against a deployed PBOS v1 boundary
- Existing-PR remediation must resolve the actual GitHub head branch instead of reconstructing it

## Definition of 100%

Each gate must have implementation, tests, operational evidence, human approval, and a certification memo.

| Gate | Required outcome | Evidence |
| --- | --- | --- |
| Durable state | Connector, domain, identity, revocation, idempotency, and event records survive restart | Restart and migration tests |
| Trusted transport | Every request is authenticated, signed, timestamped, nonce-protected, scoped, and rate-limited | Negative security tests and key-rotation evidence |
| Complete API | All four runtime channels and all connector lifecycle operations are implemented | Contract and end-to-end API tests |
| Runtime schemas | Inputs and outputs are runtime validated and version compatible | Schema fixtures and compatibility tests |
| Governed authority | PBOS resolves authority; applications cannot self-certify or self-authorize | Denial, revocation, and approval tests |
| Reliable delivery | Idempotency, bounded retry, timeout, circuit breaker, and dead-letter recovery work | Failure-injection tests |
| Observable operation | Correlation, provenance, metrics, traces, audit events, dashboards, and alerts exist | Operational readiness evidence |
| Reusable SDK | Versioned package, examples, generated types, and conformance suite are consumable externally | Clean-install consumer tests |
| Playbook activation | Playbook completes a governed real-world transaction through PBOS v1 | Repository and runtime evidence |
| Bulletproof activation | Bulletproof completes a governed real-world transaction through PBOS v1 | Repository and runtime evidence |
| Deployment readiness | Staging and production promotion, rollback, backup, restore, and incident procedures are proven | Deployment rehearsal evidence |
| Independent certification | Security, operations, governance, integration, and lineage scorecards are all certified | Final certification report |

## Implementation sequence

### CIP-038 — Integration State and Migration Layer

- [ ] Define repository interfaces for connectors, domains, identities, events, idempotency records, and revocations
- [ ] Provide durable production adapters and deterministic in-memory test adapters
- [ ] Add schema versioning and forward-only migrations
- [ ] Enforce organization isolation and unique version constraints
- [ ] Add restart, concurrent registration, migration, and cross-organization denial tests
- [ ] Create backup and restore procedure
- [ ] Prepare certification memo and stop for human validation

Exit: activation and revocation survive process restart without losing lineage.

### CIP-039 — Connector Trust and Transport Security

- [ ] Create connector credentials through PBOS governance, never application self-issuance
- [ ] Implement signed requests with connector ID, key ID, timestamp, nonce, body digest, and correlation ID
- [ ] Add replay window and nonce storage
- [ ] Add scoped tokens or short-lived service credentials
- [ ] Add credential rotation, suspension, and emergency revocation
- [ ] Add request-size limits, timeouts, CORS policy, secure headers, and rate limits
- [ ] Redact secrets and classified payloads from logs
- [ ] Add invalid signature, expired request, replay, revoked key, wrong organization, and privilege-escalation tests
- [ ] Prepare threat model and certification memo

Exit: no anonymous, replayed, expired, cross-tenant, or self-authorized request reaches PBOS runtime.

### CIP-040 — Complete PBOS v1 Connector API

- [ ] Add connector status, suspend, resume, revoke, and version negotiation operations
- [ ] Add domain status and deactivation operations
- [ ] Add capability discovery operation
- [ ] Add lifecycle event publication
- [ ] Add governed intelligence request and response
- [ ] Add approved classified data exchange
- [ ] Add audit and provenance lookup scoped to the caller
- [ ] Standardize error codes, HTTP status mapping, pagination, and correlation behavior
- [ ] Add idempotency keys for every mutation
- [ ] Add positive and fail-closed tests for every operation

Exit: every certified runtime communication channel is reachable through the versioned API.

### CIP-041 — Runtime Schema and Compatibility Registry

- [ ] Define runtime schemas for manifests, identities, lifecycle events, intelligence, and data exchange
- [ ] Validate all inbound and outbound payloads at runtime
- [ ] Register schema identity, version, compatibility policy, and owner
- [ ] Reject unknown fields where authority or classification could be altered
- [ ] Add backward-compatible version negotiation and deprecation windows
- [ ] Add golden fixtures for Playbook and Bulletproof
- [ ] Add compatibility and malformed-payload tests

Exit: TypeScript types and wire behavior cannot silently diverge.

### CIP-042 — Reliability and Delivery Guarantees

- [ ] Define retryable versus terminal failures
- [ ] Add bounded exponential backoff and jitter
- [ ] Add timeouts, cancellation, bulkheads, and circuit breakers
- [ ] Add inbox/outbox or equivalent durable delivery pattern
- [ ] Add dead-letter records with governed replay
- [ ] Enforce idempotent mutation processing
- [ ] Add degraded-mode health and dependency reporting
- [ ] Add failure-injection and recovery tests

Exit: duplicate delivery, dependency failure, timeout, and restart cannot corrupt state or authority.

### CIP-043 — Connector SDK and Conformance Kit

- [ ] Package the connector SDK independently with semantic versioning
- [ ] Add Node/server and application-safe clients without exposing privileged credentials to browsers
- [ ] Add typed operation helpers, auth signer, retries, idempotency, and schema validation
- [ ] Publish a connector manifest template and environment template
- [ ] Create a local PBOS sandbox and mock server
- [ ] Create a conformance command that tests registration through revocation
- [ ] Add clean-install consumer projects for Playbook and Bulletproof
- [ ] Document upgrade and compatibility policy

Exit: a new repository can install the SDK and pass conformance without PBOS Core source access.

### CIP-044 — Integration Observability and Operations

- [ ] Emit structured logs with system, connector, organization, operation, correlation, and provenance IDs
- [ ] Add latency, throughput, denial, failure, retry, queue, and dependency metrics
- [ ] Add distributed tracing across application, connector, PBOS runtime, and kernel
- [ ] Define service-level indicators and objectives
- [ ] Create dashboards and alert thresholds
- [ ] Create operator status, incident, replay, revoke, and audit commands
- [ ] Add runbooks for authentication failure, dependency outage, data-exchange denial, and compromised connector
- [ ] Prove audit retention and export

Exit: operators can detect, explain, contain, and recover every integration failure.

### CIP-045 — Playbook Production Connector Activation

- [ ] Normalize repository paths that differ only by case
- [ ] Install the packaged SDK and connector manifest in Playbook Platform
- [ ] Register `PLAYBOOK-SYSTEM-001`, `PLAYBOOK-OS-001`, and its domains
- [ ] Map Supabase identity to PBOS identity without transferring authentication ownership
- [ ] Complete capability discovery and health checks
- [ ] Complete Scholar onboarding-to-dashboard through a governed PBOS transaction
- [ ] Prove authority denial, revocation, provenance, restart recovery, and degraded mode
- [ ] Collect repository, CI, runtime, governance, and operator evidence
- [ ] Human-certify the connector; do not certify the whole application yet

Exit: Playbook is a live independent PBOS-powered application, not only a reference manifest.

### CIP-046 — Bulletproof Production Connector Activation

- [ ] Finish and certify the reproducible scaffold remediation
- [ ] Install the packaged SDK and connector manifest in Bulletproof Beneficiary
- [ ] Register `BULLETPROOF-SYSTEM-001`, `BULLETPROOF-OS-001`, and the legacy-planning domain
- [ ] Map application identity to PBOS identity
- [ ] Complete account-to-beneficiary-search transaction through PBOS
- [ ] Prove secure-document metadata exchange without raw-document leakage
- [ ] Prove approval, classification, owner scope, revocation, provenance, restart recovery, and degraded mode
- [ ] Collect repository, CI, runtime, governance, and operator evidence
- [ ] Human-certify the connector; do not merge or deploy without approval

Exit: Bulletproof is a live independent PBOS-powered application using the same PBOS v1 boundary.

### CIP-047 — Deployment, Security, and Ecosystem Certification

- [ ] Deploy an authenticated PBOS v1 integration service to staging
- [ ] Bind secrets through the deployment platform rather than repository files
- [ ] Prove database migration, backup, restore, rollback, and credential rotation
- [ ] Run load, soak, failure-injection, tenant-isolation, and security tests
- [ ] Conduct an incident-response rehearsal
- [ ] Verify Playbook and Bulletproof concurrently against one PBOS foundation
- [ ] Complete technical, governance, operational, security, and commercial readiness scorecards
- [ ] Produce final lineage graph and evidence bundle
- [ ] Obtain independent human approvals
- [ ] Promote only the explicitly approved release

Exit: the Integration Layer is certified 100% production-ready.

## “20/10” enhancements

These begin only after the 100% gates are complete.

- [ ] Connector developer portal with guided registration, keys, logs, schemas, and certification status
- [ ] Visual integration simulator and failure-injection laboratory
- [ ] Policy-as-code authoring with human-readable authority explanations
- [ ] Automated compatibility reports before SDK or API upgrades
- [ ] Connector marketplace with signed packages and certification badges
- [ ] Multi-region routing and disaster recovery
- [ ] Usage metering, quotas, billing events, and commercial plan enforcement
- [ ] Domain-pack certification laboratory for education, legacy planning, healthcare, finance, government, workforce, and community

## Operator checklist for every implementation batch

### Before work

- [ ] Confirm the prior batch is certified and merged
- [ ] Run `git switch main` and `git pull origin main`
- [ ] Confirm `git status` and preserve unrelated local work
- [ ] Name the CIP, scope, protected actions, repositories, and acceptance criteria
- [ ] Create an `agent/*` branch
- [ ] Confirm no application-specific behavior is moving into PBOS Core

### During implementation

- [ ] Implement contracts before adapters
- [ ] Keep production adapters behind interfaces
- [ ] Preserve backward compatibility or declare a version boundary
- [ ] Validate input at every trust boundary
- [ ] Fail closed for identity, authority, certification, classification, and provenance
- [ ] Add positive, denial, revocation, restart, and failure-recovery tests
- [ ] Add migration, rollback, audit, and operator documentation when state changes
- [ ] Never place secrets or raw classified data in source, logs, fixtures, or evidence
- [ ] Keep external application code in its owning repository

### Human validation gate

- [ ] Stop implementation changes
- [ ] Operator runs `npm run typecheck`
- [ ] Operator runs `npm run test:run`
- [ ] Operator runs `npm run build`
- [ ] For application connectors, operator also runs the repository's equivalent validation commands
- [ ] Record command, revision, timestamp, result, and relevant CI URLs
- [ ] Return failures to PBOS remediation; do not merge around them

### Certification and promotion

- [ ] Review acceptance criteria against evidence
- [ ] Review security, governance, lineage, and operational impact
- [ ] Create or update the CIP certification memo
- [ ] Obtain named human approval
- [ ] Commit only intended files
- [ ] Push the `agent/*` branch and open or update a draft PR
- [ ] Resolve review feedback and revalidate when code changes
- [ ] Merge only after certification approval
- [ ] Synchronize `main`
- [ ] Record release, migration, deployment, and rollback state
- [ ] Issue an operator memo naming the next recommended action

## Progress scoring

Progress is evidence-weighted, not file-count based:

- Durable state: 10%
- Transport security: 15%
- Complete API: 15%
- Schema compatibility: 10%
- Reliability: 10%
- SDK and conformance: 10%
- Observability and operations: 10%
- Playbook activation: 7.5%
- Bulletproof activation: 7.5%
- Deployment and final certification: 5%

No category receives credit for implementation alone. Tests, operational evidence, human approval, and certification are required.

## Immediate next action

Complete and certify the current scaffold-generator correction, then begin CIP-038. Do not mix CIP-038 state architecture into the scaffold correction batch.
