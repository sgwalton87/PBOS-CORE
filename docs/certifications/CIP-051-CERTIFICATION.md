# CIP-051 — Autonomous Batch Execution and Operator Notifications

Status: CERTIFIED

Certified: 2026-08-04

Validation evidence: Human operator confirmed successful execution of `npm run typecheck`, `npm run test:run`, and `npm run build` after completion-aware planning and duplicate-build safeguards were added.

## Purpose

CIP-051 restores high-throughput application construction while preserving PBOS governance. A delegated operator authorizes up to ten work packages once. PBOS then owns continuation through branch preparation, draft pull request creation, validation monitoring, deterministic remediation, durable operator communication, and the final certification stop.

## Certified architecture

- Durable autonomous batch identity and package queue
- Durable package-start, package-completion, section-completion, remediation, validation, and approval-readiness telemetry
- Governance ceiling of ten work packages per authorization
- One governed branch and pull request per batch
- Stable work-package identities derived from system and capability
- Repository-backed capability completion evidence requiring implementation, tests, and a durable marker
- Batch-scoped scaffold generation that materializes only authorized capabilities
- Compatibility recognition for the certified pre-marker Playbook Scholar foundation
- Duplicate-build refusal while a prior autonomous batch remains active or blocked
- Automatic background validation and remediation monitoring
- Durable state, audit-compatible memos, and restart resumption
- `pbos status`, `pbos watch`, and `pbos memo` operator surfaces
- macOS completion and blocker notifications
- Notification failure isolation from governed build state
- Human protection for certification, merge, production, secrets, destructive migrations, and cross-repository work

## Required evidence

- Batch persistence and ten-package ceiling tests
- Terminal authorization and automatic monitoring tests
- Background completion and notification tests
- Repository-default-branch provenance tests
- Durable remediation and memo tests
- Typecheck, complete test suite, and build evidence supplied by the human validation gate

## Operator contract

After selecting Delegated Autonomous Build, PBOS inspects the repository and prints the exact incomplete work packages in priority order. The operator receives a short, numbered choice: build the next one, build the next five when available, or build all remaining work packages up to the ten-package governance ceiling. The complete remaining batch is the recommended default.

Before execution, PBOS prints every selected package and the number that will remain afterward. One confirmation starts planning, construction, the governed branch and draft pull request, validation monitoring, deterministic remediation, telemetry, and operator notification. No repeated evidence-collection prompt is required. The operator is notified only when certification approval or a genuine blocker requires attention.

On every later launch, PBOS inspects the governed default branch and prints capabilities already completed there. A capability is removed from the next plan only when its generated implementation, validation test, and evidence marker are all present in the merged repository. An active or blocked batch prevents PBOS from opening a duplicate pull request.

A green batch also remains a protected stop until human certification and merge. PBOS compares its stable work-package IDs with the next default-branch plan: if they remain gaps, the terminal directs the operator to certify and merge; once their evidence is visible on the default branch, PBOS advances to the next incomplete packages.

Pull requests created before durable batches—such as the initial Playbook Scholar PR—are monitored as legacy validation runs without being assigned guessed package identities. PBOS refuses a duplicate while that run is active and recognizes its actual capability scope only from merged repository evidence.

## Validation commands

```bash
npm run typecheck
npm run test:run
npm run build
```
