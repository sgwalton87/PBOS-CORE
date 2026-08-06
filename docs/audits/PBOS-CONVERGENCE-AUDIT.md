# PBOS Constitutional Convergence Audit

Status: COMPLETE — IMPLEMENTATION AUTHORIZED BY ROADMAP ONLY
Authorities: PPS-006, PBS-5000, PBS-6000

## Executive conclusion

PBOS has a credible functional-production kernel, but the kernel is not yet the universal path through the system. The strongest implementation already enforces exact repository lineage, application startup, runtime probes, browser journeys, durable data, accessibility artifacts, security evidence, independent validation, previews, and separate human certification. The Playbook is blocked because only one mission is wired into that complete path and its current functional launch failed.

The correct strategy is convergence. Preserve the production kernel, durable Genesis state, real GitHub gateway, Playbook brownfield executors, connector security, and Mission Control. Subordinate or deprecate competing completion paths, make every application mission supply executable acceptance, connect PBS-6000 evidence to the same kernel, and then resume the Playbook journey sequence.

## Evidence inventory

- PBOS Core: 1,318 repository files, 812 TypeScript/TSX files, 116 test files.
- Active branch/revision: `agent/reproducible-dual-surface-delivery` at `486273c`.
- Dirty worktree preserved: four PBS-6000 graph/manifest files; no audit step overwrote them.
- Playbook governed checkout: clean agent branch at `d13f049`, PR #54 open, GitHub validation passed.
- Durable Genesis state: 2 systems, 17 sessions, 17 grants, 303 audit records, 8 remediation runs, 4 production runs.
- Active product state: Scholar functional mission blocked; zero functional acceptance evidence; all downstream web missions blocked.
- External evidence: Playbook Supabase project exists and reports healthy; two PBOS integration Cloud Run services exist; no Playbook Vercel deployment or domain evidence exists.

## Findings

| ID | Finding | Root cause | Impact | Evidence | Constitutional reference | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-001 | Root constitutional boot is stale | `PBOS.yaml` and root manifest predate PBS-5000/6000 | Canonical authorities are not deterministically loaded | Wrong organization path, wrong source path, missing new volumes | PBS-5000-003, PBS-6000-000 | Extend root boot/manifest/graph; validate paths and inheritance |
| A-002 | Required PPS inheritance is unavailable | Both manifests inherit PPS-000–015 but only PPS-006 is present | Constitutional traceability cannot close | Repository search | PBS-5000/6000 manifests | Register absent volumes as explicit blockers; do not fabricate them |
| A-003 | PBS-6000 documents contain duplicate embedded authorities | Additive drafting appended second frontmatter/sections to 13 files; graph has two `nodes` keys | Parsers may select different truths | Repeated IDs and duplicate YAML key | PBS-6000-012/014/015 | Normalize each file into one canonical document and one graph schema, preserving all unique rules |
| A-004 | Canonical legacy documents are empty | Earlier architecture scaffolding created zero-byte authorities | Boot can “load” contentless specifications | Empty runtime, compiler, discovery, package files | PBS-5000-003/004 | Mark incomplete/deprecated or supply governed content; fail boot on empty canonical files |
| A-005 | Three discovery/acquisition families overlap | Incremental CIPs created `acquisition`, `discover`, `discovery`, and `acquisition-engine` | Duplicate ownership and many stubs | 69 non-test files contain “not implemented,” concentrated in these systems | PBS-5000-004/016/028 | Select one live repository-intelligence facade; adapt working components; fence stubs |
| A-006 | Planning authority is duplicated | Static launch plan, Genesis build planner, constitutional planner stubs, and mission queue evolved separately | Mission source and dependency truth can disagree | CLI uses launch tasks/queue; constitutional planner is unimplemented | PBS-5000-014/016/022 | Make one durable mission graph authoritative; planners may only propose nodes into it |
| A-007 | Runtime and mission vocabulary is duplicated | Kernel, execution-engine, integration, batches, and production runtime define independent mission/status models | “Complete” can mean incompatible things | Multiple `MissionRuntime` implementations and status types | PBS-5000-002/016/017/028 | Designate production runtime as software-production state; namespace other runtimes and prohibit completion authority |
| A-008 | Legacy repository dispatch falsely reports completion | `GitHubRepositoryGateway.dispatch()` returns `COMPLETED` without mutation | Direct constitutional violation if invoked | Concrete method implementation | PBS-5000-003/029; PBS-6000-003 | Deprecate/remove completion semantics; delegate real work to branch/change/commit/PR path |
| A-009 | Certification is fragmented | CIP-020, multi-platform, launch, and production certification were built independently | Conflicting readiness claims and in-memory evidence | Four certification models; in-memory registry | PBS-5000-010/012/023/028 | PBOS Kernel becomes sole certification state transition; other engines produce candidate evidence only |
| A-010 | Live CLI registers only three mission adapters | Adapter registration stopped at repository analysis, foundation, Scholar | PBOS halts at `NO_EXECUTION_ADAPTER` | `pbos-cli.ts` registry | PBS-5000-015/016 | Register existing academic/opportunity/application/support executors, then implement missing web/mobile/release adapters |
| A-011 | Only Scholar supplies executable functional acceptance | Other executors return static evidence and CI monitoring only | Kernel cannot verify real behavior for later missions | Only Scholar returns `functionalAcceptancePlan` | PBS-5000-007–010/029 | Require functional plans from every functional executor; reject registration otherwise |
| A-012 | Foundation is misclassified as platform artifact | Completion policy exempts `048-foundation` despite behavioral criteria | Historical certification with zero functional evidence remains accepted | Durable state and completion policy | PBS-5000-010/029 | Reclassify foundation or separate true artifact setup from functional foundation acceptance |
| A-013 | Historical certifications contain no functional evidence | Older runtime allowed engineering proof to certify behavior | Ledger overstates product maturity | Two historical certified runs with zero acceptance evidence | PBS-5000-023/029 | Preserve history but mark superseded; require recertification under current policy |
| A-014 | Functional failure repair is not autonomous | Remediation engine watches GitHub checks, not launch/browser failures | Current Scholar run blocks after one launch failure | Kernel classification then block | PBS-5000-011/015 | Add bounded functional repair handlers and exact-checkpoint re-execution |
| A-015 | Current dependency install state is not durable | `node_modules` is absent after prior attempt; old run reached launch anyway | `next` command failed | Checkout inspection and run blocker | PBS-5000-007/027/029 | Use reproducible prerequisite on every resume; verify executable before launch; classify and repair dependency failures |
| A-016 | Exhausted repair budgets lacked a first-class recovery authority | A mutable budget extension could continue a run without a durable epoch snapshot | Repair history, current state, remaining defects, and authorization lineage were not one governed object | Production run `1997df6f-7d7b-45b7-9229-334f1080fa9d` exhausted 5/5 attempts | PBS-5000-003/011/012/017 | Implemented `ProductionRecoveryAuthority`: preserve attempts and evidence, snapshot state, request explicit signed authority, add exactly one attempt, and retain the same run and mission |
| A-016 | Distributed graph has no evidence collectors | Graph evaluates caller-provided observations only | It can prove topology, not platform health | Only production usage calls `assertTopology()` | PBS-6000-012–014 | Implement node collectors with freshness, source, artifact, exact environment/revision, and downstream invalidation |
| A-017 | Mission Control reports optimistic connection/health | Snapshot hard-codes connection and several component health values | Operators can mistake state readability for system health | `snapshot()` and `health()` | PBS-5000-013/019; PBS-6000-013 | Derive health from live probes and label unknown/stale truth explicitly |
| A-018 | PBOS Core lacks tracked CI | No `.github` workflow exists | Independent validation of PBOS Core is manual | Repository inventory | PBS-5000-027; PBS-6000-003 | Add authoritative CI with `npm ci`, typecheck, finite tests, build, graph/constitution checks |
| A-019 | Playbook deployment is absent | Engineering focused on local/PR validation and PBOS integration Cloud Run | No real web link or release lineage | No Vercel config/link/URL | PBS-5000-024/029; PBS-6000-006/011/015 | Implement exact-commit Vercel preview/staging collector and protected production promotion |
| A-020 | Mobile delivery is a manifest generator, not an app runtime | CIP-049 currently emits config/contracts/checklists | No iOS/Android executable behavior | `ApplicationDeliveryGenerator` | PBS-5000-007–010; PBS-6000-011/015 | Build shared mobile client, device acceptance, previews, signing/store evidence |
| A-021 | Playbook external services are undeclared | Product source accumulated provider references independently | Environment parity and provider health cannot be known | Process environment/source scan | PBS-6000-001/008–010 | Add blueprint platform declarations and protected reference inventory |
| A-022 | Integration state is separate from production state without formal lineage | Connector runtime has its own durable store for a valid operational concern | Cross-runtime state can drift silently | Genesis state vs integration JSON state | PBS-5000-017; PBS-6000-014 | Retain specialized store but add canonical identity/revision links and convergence evidence |
| A-023 | Launch readiness and ecosystem tools can validate asserted JSON | Tools check shape/booleans supplied by files rather than collecting observations | Evidence can be syntactically valid but unobserved | Release and ecosystem CLI tools | PBS-5000-012/023 | Make tools consume kernel evidence IDs and platform collector artifacts |
| A-024 | Playbook breadth exceeds proven depth | 126 routes and 102 tests exist, but only one browser acceptance journey exists | Route count can be mistaken for product completion | Product checkout inventory | PBS-5000-005/006/029 | Progress by connected user journey, not route/package count |
| A-025 | Local disk headroom is fragile | Data volume has about 2.7 GiB free; Playwright/npm installs are large | ENOSPC previously invalidated whole validation runs | Filesystem observation and prior failures | PBS-5000-007/013 | Preflight projected dependency/browser space and retain cleanup guidance; never begin if reserve is unsafe |
| A-026 | Architecture path is normalized in Git but aliased by macOS | Git tracks only lowercase `docs/architecture`; filesystem resolves uppercase to same inode | Automation must use canonical lowercase path | Git index and inode comparison | PBS-6000-003/010 | Enforce lowercase path in boot and constitution validation |

## Preserved architecture

The following are convergence anchors and should be extended, not replaced:

1. `GenesisStateRepository` for canonical software-production state and audit history.
2. `ProductionRuntimeService` for runs, stages, events, leases, telemetry, and protected transitions.
3. `AutonomousProductionKernel` for executable functional acceptance.
4. `FunctionalApplicationRuntime` and `FunctionalAcceptanceVerifier` for exact-commit product proof.
5. `GitHubRepositoryGateway` real branch/change/commit/push/PR operations.
6. `ResumableRemediationEngine` for bounded CI remediation.
7. `Mission Control` as the operator read model, after health becomes evidence-based.
8. Existing Playbook journey executors as brownfield assets, after each receives functional acceptance.
9. Connector HMAC, identity, authority, provenance, and idempotency boundaries.
10. `DistributedPlatformGraph` as dependency/health truth supplied to the existing kernel, not as a new runtime.

## Explicit non-conclusions

- Green CI does not prove Playbook functionality.
- An open or merged PR does not complete a functional mission.
- Cloud Run integration health does not prove the Playbook application is deployed.
- Route, package, migration, or test counts do not prove a user journey.
- A syntactically valid evidence JSON file is not an observation unless it is linked to a kernel-run artifact and exact revision.
