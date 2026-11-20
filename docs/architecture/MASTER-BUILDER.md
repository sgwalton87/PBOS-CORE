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

## Next engineering milestone (MB-02)

Connect the evaluator to **read-only** existing verifier/Canon/approval/lease adapters, with tests proving that the adapters cannot initialize or write state. Then rehearse a single approved mission in disposable Genesis with the existing bounded Codex worker, exact-head CI, draft PR publication and evidence collection. Do not activate original Genesis, merge, deploy, or amend Canon.

See PBOS-CORE issue #91 and separate recovery issue #92. Core drafts #89/#90 and Platform draft #318 remain independent review gates.
