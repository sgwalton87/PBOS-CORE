# Playbook Active Launch Checklist

## Current gate

PR #67 is **NOT CERTIFIABLE**. Human Preview review found product-wide gaps that
the narrow Scholar acceptance path did not cover: incomplete collapsed
navigation, undersized branding, hard-wired Compass data, duplicate Oracle/back-
office navigation, broken Google OAuth, undiscoverable newsfeed, and legacy
visual layouts outside the new landing route. Preserve the Preview as defect
evidence and expand acceptance to the complete visible application surface.

Implementation and certification are frozen at the constitutional traceability
gate. The existing PBS-5000/PBS-6000 matrix is an infrastructure audit, not an
enforceable Playbook product graph: it marks Product Graph and Acceptance Graph
missing, does not map the canonical product volumes to routes or design canon,
and contains stale platform findings. PBOS must not resume product mutation or
request certification until the graph below is complete and validates the
governed Playbook revision.

Exact-revision baseline: 15/15 phases incomplete; 18/58 requirements
implemented, 24 partial, 16 missing; 23/93 visible routes mapped; 1/93 visible
routes design-canon bound; 148 enforceable blockers. See
`docs/audits/PLAYBOOK-CANON-TO-PRODUCT-CONVERGENCE.md`.

## Canon-to-product traceability gate

- [x] Compile and digest-bind the 18 current engineering/product authority entry sources
- [x] Recompile the canon graph from the current governed Playbook revision on every readiness-queue synchronization
- [x] Replace stale whole-product completion with dependency-ordered authority, journey, design, 15-phase, requirement, web, mobile, and ecosystem missions
- [x] Require final Playbook product certification to depend on every canonical phase rather than the former seven-journey aggregate alone
- [x] Emit exact canon authority, phase, requirement, route, and blocker counts in the launch terminal
- [ ] Register certified execution adapters for every newly generated canon mission before PBOS advertises complete adapter coverage
- [ ] Classify all 344 Playbook documentation/configuration artifacts as canonical, generated, historical, deprecated, duplicate, or conflicting
- [ ] Register every canonical document with ID, version, authority, owner, dependencies, and content digest
- [ ] Resolve every zero-byte canonical document through the approved documentation, governance, or hygiene track
- [ ] Inventory every Playbook OS, role, route, API, component, data store, integration, and visible navigation entry
- [ ] Map each canonical requirement to its owning Playbook OS and user journey
- [ ] Map every journey to exact desktop/mobile routes, states, actions, APIs, durable data, and external dependencies
- [ ] Map every visible route and state to an approved design-canon ID and required assets
- [ ] Mark legacy, demo, hard-wired, duplicate, orphaned, and back-office-only surfaces explicitly
- [ ] Bind each graph node to exact implementation files and exact-revision automated acceptance evidence
- [ ] Fail the PBOS build when a required node or edge is missing, stale, contradictory, or only documentation-backed
- [ ] Render uncovered requirements and downstream invalidation in Mission Control and same-terminal telemetry
- [ ] Reconcile PR #67 against the completed graph; preserve it as defect evidence until every required surface passes

## Active PBOS-to-Playbook delivery proof

- [x] Vercel web-preview provider registered behind governed preview routing
- [x] EAS iOS/Android internal-build provider registered behind the same routing boundary
- [x] Background validation resumes the exact production run without duplicate branches
- [x] Same-terminal telemetry follows CI, deployment, runtime, browser, native, and acceptance stages
- [x] Mission Control separates Playbook and Bulletproof application delivery surfaces
- [x] Final ecosystem certification requires separate application and platform approvals
- [x] Human validation of the application-delivery proof implementation
- [x] Detect a merged pull request and use its merge commit as validation lineage
- [x] Dispatch governed CI once when a merge commit has no checks or only skipped checks, then stop finitely if CI never starts
- [x] Refuse to mutate closed or merged pull-request branches
- [x] Position the governed checkout on the exact default-branch merge commit before acceptance
- [ ] Human validation of merged-revision convergence implementation
- [x] Exact Playbook merge commit receives an independent CI check
- [x] Protected doctor distinguishes Scholar readiness from academic-journey readiness
- [ ] Add the missing `ANTHROPIC_API_KEY` to an accepted mode-0600 Playbook source
- [x] Academic browser acceptance passes on the exact Playbook revision
- [ ] One real Playbook exact-revision preview passes product-wide functional acceptance
- [x] Terminal renders the real desktop web and mobile links from that same run
- [ ] Human reviews the links and issues the distinct certification/merge decision
- [ ] Collapsed navigation exposes About, Explore, Log in, and Join actions
- [ ] Public and authenticated shells use appropriately sized Playbook branding
- [ ] Compass consumes authenticated durable Scholar data (no demo constants)
- [ ] Oracle exposes one role-appropriate product menu; studio/back-office controls remain isolated
- [ ] Google OAuth completes from Preview through the configured callback
- [ ] Newsfeed is discoverable and functionally accepted from authenticated navigation
- [ ] All human-facing routes conform to the approved futuristic design schema
- [ ] Product-wide desktop and mobile route matrix passes human and automated review

## PBS-5000 functional production convergence

- [x] Green CI is prohibited from independently declaring application completion
- [x] PBOS Kernel owns functional acceptance and certification readiness
- [x] Exact-revision application launch and health verification implemented
- [x] Runtime probe, browser journey, accessibility, security, and evidence stages emit telemetry
- [x] Desktop and mobile browser evidence required for experience-changing missions
- [x] Temporary local runtime is no longer mislabeled as a durable live preview
- [x] Functional failure enters bounded repair
- [x] Scholar executable Playwright acceptance package and plan generated by the application adapter
- [x] Human validation of the PBOS Core convergence and launch-hardening batch
- [x] Generic fail-closed protected-environment resolver and Playbook readiness doctor prepared
- [x] Protected Scholar acceptance environment available to the PBOS runtime (`12/12` values; values never displayed)
- [x] Doctor distinguishes application acceptance readiness from staging migration authority
- [x] Partial or empty Scholar schema is eligible for the same idempotent, atomic staging migration
- [x] Staging migration is bound to the exact production run, pull request, branch, and commit
- [x] Declining or deferring migration pauses validation cleanly without losing resumability
- [x] Malformed staging endpoints fail closed as named doctor blockers without network access
- [ ] Supabase management token available to the protected runtime as `SUPABASE_ACCESS_TOKEN`
- [x] PR #54 Playwright/Vitest collision has an exact deterministic remediation pack
- [x] PR #54 remediation also normalizes the Scholar registration ID and hardens PBOS health/transport before persistence
- [x] Exact-commit Scholar browser journey executed successfully
- [ ] Desktop and mobile Scholar evidence reviewed and certified

### Protected Scholar acceptance setup

PBOS accepts the required values from the live process, the governed Playbook checkout's non-versioned `.env.local`, or `~/.pbos/secrets/playbook-scholar-acceptance.env`. Any source file must be restricted with mode `0600`. PBOS reports variable names and readiness counts only; it never writes values into Genesis state, telemetry, memos, commits, or validation output. If the Scholar tables are absent or partially initialized, the same file must also contain `SUPABASE_ACCESS_TOKEN` so PBOS can request a separately signed staging-migration approval and call the Supabase Management API without printing or persisting the token.

The protected file must supply the staging Supabase URL, anon key, service-role key, PBOS v1 endpoint, organization/connector/key identity, connector secret, separately issued Scholar identity and exchange approvals, and a synthetic acceptance-user email and password. PBOS does not manufacture any of those approvals or credentials.

Operator preflight after this batch is validated:

```bash
mkdir -p ~/.pbos/secrets
chmod 700 ~/.pbos/secrets
touch ~/.pbos/secrets/playbook-scholar-acceptance.env
chmod 600 ~/.pbos/secrets/playbook-scholar-acceptance.env
npm run pbos:doctor -- playbook
```

Once the doctor reports `READINESS: READY` or `READINESS: READY_FOR_GOVERNED_MIGRATION`, rerun the normal `pbos build playbook` flow. The same command will automatically recheck readiness before consuming mission approval or changing The Playbook repository, repair PR #54 at its exact revision, stream CI and runtime telemetry, request the protected staging decision when required, and stop only at certification/merge or a concrete blocker.

After Scholar certification, PBOS will expose the next dependency-satisfied Playbook mission. It will not claim whole-application completion: academic, opportunity, application, support, messaging, notification, aggregate web, mobile, store, and ecosystem missions still require their own executable adapters and acceptance contracts.

## CIP-045 connector activation

- [x] Live signed activation
- [x] Cross-revision recovery
- [x] Governed suspension, denial, persistence, and resume
- [x] Credential rotation proof implementation merged
- [x] Live credential rotation output recorded
- [ ] Connector SDK registry installation completed
- [x] Human CIP-046 certification issued

## CIP-046 multi-system proof

- [x] Bulletproof manifest and activation harness prepared
- [x] Cross-connector authentication boundary prepared
- [ ] Human validation green
- [x] Protected Bulletproof staging activation approved
- [x] Parallel isolation evidence collected
- [ ] Human certification issued

## CIP-047 runtime readiness

- [x] Staging Cloud Run, immutable build, durable state, health, authentication, activation, recovery, and suspension proof
- [x] Credential rotation evidence recorded
- [x] Backup/restore and evidence digest proof
- [x] Rollback and resilience evidence verifiers prepared
- [x] Monitoring and incident-operations evidence verifier prepared
- [ ] Rollback and degraded-mode proof
- [ ] Load, rate, concurrency, and failure-injection proof
- [ ] Monitoring, alerts, incident response, and disaster recovery
- [ ] Production/staging isolation
- [ ] Human certification issued

## CIP-048 web completion

- [x] Evidence-driven launch work-package compiler prepared
- [x] Responsive accessible web target required
- [x] Exact Playbook revision and repository baseline inspected
- [x] Web/mobile journey gap compiler prepared
- [ ] Complete Playbook 84-unit ownership and journey map
- [x] Foundation and Scholar slice engineering implementation
- [ ] Foundation engineering evidence reconfirmed under PBS-5000
- [ ] Scholar slice functionally accepted through a real browser and durable staging data
- [ ] Connected product journeys
- [ ] Web staging acceptance
- [ ] Human certification issued

## CIP-049 mobile/store readiness

- [x] Web/iOS/Android delivery generator prepared
- [x] Secure-storage, deep-link, privacy, signing, and release gates represented
- [x] Cross-platform journey and release evidence verifier prepared
- [ ] Materialize into Playbook repository
- [ ] Implement and validate mobile journeys
- [ ] Apple and Google account/signing configuration
- [ ] TestFlight and Play internal testing
- [ ] Store submission approval
- [ ] Human certification issued

## CIP-050 ecosystem certification

- [x] Multi-platform certification engine prepared
- [x] Independent-system, shared-contract, lineage, and scorecard rules represented
- [x] Separate web, Apple, Google, and final human approval boundaries represented
- [ ] Playbook web/iOS/Android evidence complete
- [ ] Bulletproof web/iOS/Android evidence complete
- [ ] Shared-contract and ownership-isolation proof complete
- [ ] Separate Playbook human certification issued
- [ ] Separate Bulletproof human certification issued
- [ ] Public promotion and store submissions separately approved
