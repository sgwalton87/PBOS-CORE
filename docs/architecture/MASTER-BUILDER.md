# The Master Builder™ — MB-01 Readiness Gate

**Organizational designation:** Playbook Series Inc. is the intended parent and IP owner. The Master Builder™ is a named PBOS capability, not a separate orchestrator or legal entity. Trademark clearance and IP chain-of-title review remain pending.

## Scope of this change

`pbos/master-builder/readiness-gate.ts` is a pure, deterministic **eligibility evaluator**. It accepts independently verified evidence and emits an ordered list of blockers. It performs no I/O, writes no Genesis state, grants no approval, starts no mission, and cannot authorize execution.

Its `executionAuthorized` value is always `false`. Even a green readiness result is only `ELIGIBLE_FOR_SEPARATE_AUTHORIZATION`. The existing PBOS production runtime, signed approval system, integrity verifier, mission queue, leases, and Canon compiler remain authoritative.

This first version intentionally requires **synthetic state** and an **isolated worktree**. It cannot be used as a production mission gate without a separate design and authorization review.

## Evidence contract

- Genesis: VALID / INVALID / UNKNOWN
- Canon item evidence: COMPLETE / BLOCKED / UNKNOWN
- Authenticated operator and separately verified, mission-scoped approval
- Pinned repository revision and isolated worktree
- Synthetic state and absence of an existing active lease

Unknown evidence fails closed. Each failed condition yields a stable reason code. The caller is responsible for obtaining evidence from authoritative components rather than inventing booleans.

## MB-01 operator evidence adapter

`pbos/master-builder/operator-evidence-adapter.ts` consumes the existing `OperatorPreflightReport` type. It maps observed Genesis integrity, authenticated operator state, digest stability, and active run/lease counts to the pure gate. It fails closed when counts or integrity results are unavailable. It does not infer approvals, Canon completion, isolation, or synthetic state from preflight. This is a typed adapter, not a verified end-to-end evidence collector; no mission has run.

## Next engineering milestone (MB-02)

Connect the evaluator to **read-only** existing verifier/Canon/approval/lease adapters, with tests proving that the adapters cannot initialize or write state. Then rehearse a single approved mission in disposable Genesis with the existing bounded Codex worker, exact-head CI, draft PR publication and evidence collection. Do not activate original Genesis, merge, deploy, or amend Canon.

See PBOS-CORE issue #91 and separate recovery issue #92. Core drafts #89/#90 and Platform draft #318 remain independent review gates.

## Compatibility with the existing autonomous builder

The Master Builder™ is a **product capability of the existing PBOS autonomous stack**, not a competing executor. Its MB-01 files are read-only observation/eligibility layers. Existing components retain their authority:

| Existing component | Authority retained |
| --- | --- |
| `GovernedMissionQueue` | Dependency reconciliation and deterministic mission selection |
| `ProductionMissionAdapterRegistry` | Explicit registered executor availability and functional-plan capabilities |
| `ProductionMissionRunner` | Bounded mission sequencing, approvals list, build-channel identity, run lifecycle and continuation |
| `ProductionRuntimeService` | Genesis-backed events, leases, transitions, repair budgets and evidence |
| `AutonomousProductionKernel` | Functional application verification and acceptance/certification readiness |
| Canon compiler and signed identity/approval services | Canon evidence and approval authority; NOT replaced by caller booleans |

`existing-runtime-compatibility.ts` reads registry **coverage** without calling an executor factory, checks candidate/runner request alignment, and requires one-mission/no-continuation disposable rehearsal bounds. It **never invokes** `ProductionMissionRunner.run`. A string authorization artifact is not proof of signature verification. No runtime authority is delegated to the preview.

**Open integration gap:** bind actual signed-approval and Canon evidence to the preview, ensure exact mission/revision identity across queue/runner/kernel, and perform the first disposable end-to-end run with durable evidence. Original Genesis integrity remains blocked pending separately approved recovery.

## Signed approval verifier reuse (MB-01)

`signed-approval-evidence.ts` accepts the **existing** `OperatorIdentityService.verify(approval, action, resource, at)` contract. It returns no evidence when the existing verifier denies or throws, when approval is absent, or when the context is not disposable. It never issues approvals, reads signing keys, or constructs a parallel identity system.

**Boundary:** This verifies the signature only for the supplied action/resource. The authoritative runtime must establish the correct action/resource and bind it to the exact mission, repository, commit, and namespace; caller-selected strings are not independent proof of scope. The complete end-to-end signed approval integration remains unverified.

## Existing Playbook Canon product graph integration

`canon-graph-evidence.ts` consumes `PlaybookCanonProductGraphCompiler` output from `pbos/application-readiness/playbook-canon-product-graph.ts` rather than compiling a second Canon. It checks repository identity, exact 40-character source SHA, source digest provenance, compiler blockers and certification readiness. It never changes Canon or grants execution authority.

**Important:** `certificationReady` is a strict product-wide certification condition; an incomplete Playbook graph must be reported as blocked, not silently treated as complete. This strict certification gate must not be confused with a separate mission-scoped build permission; future mission-scoped Canon checks must use an independently defined existing authority, not weaken this certification result. Existing outstanding Playbook Canon findings therefore remain blockers to certification.
