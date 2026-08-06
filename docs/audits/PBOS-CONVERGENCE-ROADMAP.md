# PBOS Constitutional Convergence Roadmap

Status: READY FOR GOVERNED IMPLEMENTATION
Objective: autonomously finish The Playbook without replacing working PBOS architecture.

## Execution checkpoint — 2026-08-05

- Stage 0 loader and root-authority convergence: implemented; inherited PPS volume absence remains explicit.
- Stage 1 functional-completion fencing: implemented for the production kernel and legacy GitHub false-completion paths.
- Stage 3 adapter registration: functional-plan capability is enforced; complete journey coverage remains open.
- Stage 4 Scholar recovery: PR #54 exact head `fc9ca27` is independently green; launch/probes have passed on earlier exact revisions; browser acceptance remains uncertified.
- Bounded recovery: five attempts are preserved. Disk safety is restored and PBOS now requires a signed one-attempt extension before retrying the corrected exact revision.
- Latest PBOS Core gate: typecheck passed, 113 test files / 390 tests passed, and build passed.

## Dependency law

Each stage must preserve repository history and pass its listed exit gate before downstream work may claim readiness. Work may be prepared in parallel only when it does not bypass the product dependency graph. Protected merge, production deployment, secrets, destructive migration, certification, and external account actions remain human-gated.

## Stage 0 — Canonical authority convergence

1. Normalize PBS-6000 into one frontmatter block and one unambiguous machine graph.
2. Extend root `PBOS.yaml`, manifest, graph, and boot order to include PPS-006, PBS-5000, and PBS-6000.
3. Correct canonical paths (`pbos`/`packages`, `docs/organization-genome`, lowercase `docs/architecture`).
4. Add a constitutional loader that fails closed on absent inherited volumes, duplicate IDs/keys, broken paths, and empty canonical files.
5. Record unavailable PPS-000–005 and PPS-007–015 as blockers rather than inventing content.

Exit gate: one deterministic constitutional graph loads without ambiguity; absent authorities are explicit blockers.

## Stage 1 — One authority for missions, runtime state, completion, and certification

1. Declare `ProductionRuntimeService` the canonical autonomous-software-production state machine.
2. Declare `AutonomousProductionKernel` the sole functional acceptance and completion authority.
3. Convert launch readiness, CIP-020 certification, ecosystem certification, and scorecards into evidence producers/candidate evaluators only.
4. Deprecate legacy repository `dispatch()` completion and scorecard promotion semantics.
5. Namespace integration/kernel/execution-engine mission states and prohibit them from completing product missions.
6. Preserve all historical records; mark incompatible historical certifications as superseded, never delete them.

Exit gate: no public path can mark a functional mission complete/certified without the kernel verifier and exact-commit evidence.

## Stage 2 — Canonical graph and evidence convergence

1. Implement durable Repository, Product, Journey, Acceptance, Dependency, Runtime, and Platform graph records inside canonical Genesis state.
2. Translate `PLAYBOOK_LAUNCH_TASKS` into Product/Journey/Dependency nodes instead of maintaining a parallel completion model.
3. Link every production run, stage, event, PR, commit, environment, platform observation, acceptance artifact, and approval.
4. Add evidence freshness and invalidation when a commit, schema, deployment, credential reference, or upstream node changes.
5. Make Mission Control consume these graph projections from the same state.

Exit gate: every mission traces repository → runtime → tests → Mission Control → acceptance → certification.

## Stage 3 — Universal executor and functional-plan contract

1. Require every `FUNCTIONAL_APPLICATION` adapter to return a `FunctionalAcceptancePlan` before it can register.
2. Register existing academic, opportunity, application, and support executors in the live CLI.
3. Add executable browser plans for those four journeys.
4. Implement missing messaging, notification, connected-product, and web-staging executors and plans.
5. Split `048-foundation` into artifact preparation plus executable foundation acceptance, or reclassify it as functional.
6. Reject static acceptance evidence as completion evidence; it may support engineering review only.

Exit gate: adapter coverage is complete through CIP-048 and every behavioral mission has executable runtime/browser acceptance.

## Stage 4 — Recover and prove the Scholar journey

1. Reconcile PR #54 and the blocked run at exact commit `fc9ca27`.
2. Re-run reproducible `npm ci` from the lockfile and verify `node_modules/.bin/next` before launch.
3. Add bounded functional repair for dependency preparation, application launch, runtime probes, and browser acceptance.
4. Route exhausted budgets through constitutional Recovery Authority epochs; never reset attempt counts or create replacement missions.
5. Launch The Playbook, verify Supabase tables/RLS/auth, signed PBOS transactions, desktop/mobile browser journey, accessibility, and security.
6. Produce screenshots, trace, acceptance report, runtime evidence, and preview evidence at the exact commit.
7. Stop for human certification and merge only after the kernel reaches `AWAITING_APPROVAL`.

Exit gate: a real Scholar signs in, completes onboarding, persists governed data, and opens the dashboard on desktop and mobile viewport evidence.

## Stage 5 — Complete the connected web product

Execute and certify in dependency order:

1. Transcript → academic readiness.
2. Academic readiness → explainable opportunity matches.
3. Opportunity → durable application workspace and private documents.
4. Application → authorized support request.
5. Support relationship → governed durable messaging.
6. Domain events → idempotent notification/outbox journey.
7. Connected cross-journey regression acceptance.

Each journey must prove identity, authority, durable data, PBOS provenance, loading/empty/error/recovery, responsive UX, accessibility, security, CI, and browser behavior.

Exit gate: all CIP-048 journeys are kernel-certified on one connected Playbook revision.

## Stage 6 — PBS-6000 distributed platform convergence

Implement collectors in topological order:

1. Constitution: versions, inheritance, graph integrity.
2. GitHub: repository identity, exact revision, branch protection, required CI, referenced secrets.
3. PBOS: runtime integrity, mission/evidence/certification state.
4. Secrets: presence, scope, rotation metadata, consumer references; never values.
5. Supabase: project identity, migrations, schema, RLS, auth, storage, realtime/functions when declared.
6. Google Cloud: project identity, enabled APIs, OAuth callbacks, IAM/service accounts, deployed PBOS image lineage.
7. Client: lockfile, startup, routes, browser/accessibility/security behavior.
8. Observability: logs, traces, metrics, alerts, heartbeat freshness.
9. Declared AI/external providers: declaration, configuration reference, connectivity, quota/fallback.

On drift, repair only deterministic authorized differences and revalidate every downstream node.

Exit gate: functional-acceptance scope is healthy from constitution through product with fresh evidence.

## Stage 7 — Durable Playbook web staging and production readiness

1. Establish the canonical Vercel project and environment ownership.
2. Define local/CI/preview/staging/production environment manifests and parity rules.
3. Deploy the exact certified commit to a durable HTTPS preview/staging URL.
4. Probe routes/APIs, run Scholar and connected journeys remotely, and bind evidence to deployment ID and commit.
5. Configure and validate domain, DNS, TLS, redirects, email routing, SPF/DKIM/DMARC, monitoring, and declared providers.
6. Present the web link in Mission Control.
7. Stop for protected production-deployment and release certification approval.

Exit gate: Mission Control offers a healthy, exact-revision “Open web app” link and all production-release platform nodes are healthy.

## Stage 8 — Real iOS and Android delivery

1. Generate a shared mobile application foundation that reuses contracts, design tokens, brand assets, identity, and APIs.
2. Implement native secure storage, deep links, notifications, offline/recovery, and platform isolation.
3. Execute primary Scholar journeys on iOS and Android device/simulator runtimes.
4. Capture device screenshots, accessibility, security, privacy, performance, and acceptance evidence.
5. Create durable internal preview links/artifacts.
6. Stop for Apple/Google developer account, signing, privacy disclosure, TestFlight/Play internal testing, and store submission approvals.

Exit gate: Mission Control offers an interactive mobile preview and separately certified iOS/Android release candidates.

## Stage 9 — Ecosystem certification and continuous convergence

1. Rebuild CIP-050 reports from kernel and platform evidence IDs, not operator-authored booleans.
2. Prove Playbook and Bulletproof share PBOS contracts while retaining separate repositories, brands, data, credentials, deployments, and release authorities.
3. Issue separate human certifications.
4. Run continuous platform drift collection, downstream invalidation, bounded repair, and Mission Control notification.
5. Select the next Product Graph mission after each certification.

Exit gate: PBOS never reports complete unless a real user workflow works on an exact certified revision and the required distributed platform remains healthy.

## Immediate implementation batch

The first governed batch after this audit is:

1. Canonical loader/boot convergence.
2. Completion-authority fencing.
3. Adapter contract enforcement.
4. Register the four already-implemented Playbook journey executors.
5. Recover the Scholar functional launch using the existing exact-commit plan.

This order strengthens authority first, reuses existing engineering, and then makes The Playbook measurably more functional.

## Validation gate for each batch

Validation Commands Ready:

```bash
npm run typecheck
npm run test:run
npm run build
```

Application-functional batches additionally require launch, runtime probes, API/database/auth checks, desktop/mobile browser acceptance, screenshots, exact-commit preview evidence, and human certification.
