# MB-03 — Repeatable Governed Engineering: Remote Runtime Contract

**Status:** Disposable admission and recovery implemented for isolated review. Remote execution and certification are pending.
**Parent:** The Master Builder™ in PBOS-CORE.  
**Tracking:** #95. **Dependencies:** draft #93 (foundation), draft #94 (single disposable-cycle proposal).  
**Base:** `feat/master-builder-readonly-gate` at `2ccbb1576dfb64e22a0ad1f9cb7daa389f52b956`.

## Evidence baseline and limits

One local MB-02 disposable cycle was reported as signed, executed, independently reviewed locally, and proposed at `dad63ac2ce8420b3474669c7ada1f4d5528f40c9`. GitHub verifies the one-file/four-line PR #94 diff and passing exact-head CI (runs 44833978664 and 44834000505). The local Codex process receipt, operator signature, ledger and reviewer artifacts are **not remotely independently attested**. PR #94 remains a draft; owner sign-off is not a GitHub independent review. The MB-02 workflow is **preflight only**, not an autonomous worker.

## Authority separation

1. **Mission selection:** reuse `GovernedMissionQueue`. Selection is not permission.
2. **Authorization:** reuse `OperatorIdentityService` and the existing mission-scoped `master-builder:disposable-mission` verification contract. Signature must bind mission ID, repository, exact source SHA, environment/namespace, allowed paths, expiration and approved action. No approval creation inside worker code, no fallback to a string token, no cross-mission reuse.
3. **Execution:** reuse `ProductionMissionRunner`, `ProductionRuntimeService`, and the registered existing Codex agent. A remote worker may execute only a verified lease for one mission in an exact-SHA detached disposable worktree. No second orchestration engine.
4. **Verification:** separate worker results from an independent read-only verifier. The worker must not approve its own diff, evidence, or CI.
5. **Proposal:** only a draft PR against an explicitly pinned nonproduction base. Human review and independent CI precede any later promotion; no automatic merge or deploy.

## Remote worker admission protocol

Fail closed unless all conditions are independently observed:
- Runner identity and short-lived job identity are authenticated; job has least-privilege repository read access, no production cloud tokens, no original Genesis mount, no signing key and no persistent Git write credentials.
- Mission approval signature is checked against **exact** mission scope and current time; revocation/expiry is rechecked immediately before process spawn.
- Repository remote, exact 40-character source SHA, Git worktree registration, separate gitdir/common-dir, canonical path, clean status and expected disposable namespace all match.
- Allowed paths are normalized and validated **before** process launch; reject empty scopes, `.`, `..`, absolute paths, path separators that escape the repository, Git administrative paths, and any symlink traversal. Reject renames involving any out-of-scope source or destination.
- Claim the existing execution lease and persist mission, attempt, approval, and source in one transaction. The authority rejects previously claimed repository/mission pairs, attempt IDs, and approval IDs, including when a previous run failed.
- Invoke the existing Codex agent with a Core-compatible, one-file bounded prompt. The Playbook Canon/browser-artifact prompt must not silently expand this mission's scope.
- On failure, timeout, cancellation, lost heartbeat or incomplete evidence, mark the attempt blocked. Do not silently retry or relaunch.

## Durable event and evidence protocol

Append-only, timestamped, hash-linked records for **SELECT, PLAN, BUILD, TEST, VERIFY, DOCUMENT, PROPOSE**, each containing: mission/attempt ID, actor/runner identity, source SHA, approval digest, previous-event digest, stage input/output digests, artifact location, and completion status. Never store credentials, signing material or raw environment dumps.

- SELECT: authoritative queue decision and dependency state.
- PLAN: persisted runner plan, scoped files, timeout, test commands and lease.
- BUILD: Codex process invocation receipt (exit status, run ID, start/end, executable version), immutable stdout/stderr digests and changed-path manifest. A CLI transcript is **not** a provider attestation.
- TEST: commands, exit codes, tool versions and immutable log digests.
- VERIFY: independent source/worktree reattestation, symlink/rename/path checks, diff hash, approval recheck, Genesis isolation and policy result. Preserve failed verifications; never overwrite history.
- DOCUMENT: evidence index, known limitations, recovery instructions and reviewer decision.
- PROPOSE: exact commit SHA, draft PR URL, base SHA, diff hash and CI run IDs/results. No PR means PROPOSE is incomplete.

Store non-secret evidence in durable, access-controlled artifacts with retention and immutable digest references; redact sensitive data before upload. A local file path is not a remotely available artifact.

## Recovery and idempotency contract

| Condition | Required behavior |
| --- | --- |
| Duplicate trigger, same attempt | Reject the trigger and inspect the persisted attempt with the read-only recovery API |
| Duplicate mission, different attempt | Reject the same repository/mission pair in the authoritative state, even with a new signature |
| Lease expired or worker interrupted | Inspect the preserved lease and dispatch evidence. A separate signed approval may quarantine the attempt record. The worktree remains available for independent review |
| Approval expired or revoked | Block admission and resume; never reuse approval |
| Source SHA or base branch drift | Block; re-plan and obtain fresh approval |
| Worker produces out-of-scope diff | Reject, preserve audit receipt and quarantine; never propose |
| Test or verifier failure | Preserve failed stage, block proposal; repair only through separately authorized action |
| PR created but CI pending | Await exact-head CI, do not certify |
| CI failure | Block certification and preserve run URL and logs |

Recovery starts with read-only inspection. A separate operator-signed `master-builder:quarantine-disposable-attempt` approval can quarantine an inactive or expired attempt. The marker retains the execution checkpoints and lease history. It neither restarts the worker nor releases an expired active lease. There is no BUILD resume in this implementation. A stale state-store lock also fails closed and requires infrastructure review. Keep all contenders for a mission on one authoritative controller and state file. Separate state files have independent replay histories.

## Current implementation boundary

`runMb03DisposableMission` verifies the operator signature before admission and immediately before dispatch. The signed resource includes the exact allowed file list and designated worker and attempt identities. The existing queue and runner record the lease and checkpoints in a freshly initialized, marked disposable state repository. After the adapter returns, checks cover the pinned detached worktree, changes to existing tracked regular files, symlinks, and the exact change scope. These checks alone cannot establish remote worker identity.

The bounded Codex mode uses explicit disposable HOME, CODEX_HOME and scratch paths. The controller must supply an isolated implementation adapter. The worker environment still requires a reviewed remote provisioner that prevents access to operator state, the original Genesis, host files and production credentials. No network service, provider trust root, remote credential provisioning or live dispatch workflow is configured here. Keep the authoritative state separate from worker storage.

The current integration records SELECT and PLAN, and records BUILD when an adapter returns and the local output passes scope inspection. The ledger validates order, hashes, changed paths, test/verification diff correlation, and proposal SHA/CI head correlation. It provides a local integrity check. A separately trusted verifier and artifact store must attest TEST, VERIFY, DOCUMENT and PROPOSE. The runner blocks acceptance until that verifier is integrated.

## MB-03 acceptance matrix

- [ ] Two **distinct** legitimately signed disposable missions executed by a remote Codex worker using the existing runner; each has a unique lease and process receipt.
- [ ] Both missions produce independently verifiable exact-head CI, immutable seven-stage evidence and reviewable draft proposals.
- [ ] Repeated trigger produces zero duplicate worker processes.
- [ ] Interrupted worker rehearsal preserves evidence and does not silently restart.
- [ ] Revoked/expired/cross-mission approval, wrong SHA, symlink traversal, out-of-scope rename, dirty worktree, and missing evidence all fail closed.
- [ ] Remote artifact access and retention independently reviewed; no signing key or production credential exposed.
- [ ] Human certification recorded separately. No merge, deployment, or original Genesis mutation.

## Implementation sequence

**A — Reviewable contracts and tests:** extract local Core-compatible adapter/recovery harness for independent review; implement admission and duplicate/recovery negative tests against existing runner and identity service. This can proceed via GitHub draft PRs without local Codex.

**B — Remote credentialed rehearsal:** provision a reviewed, isolated remote worker with short-lived credentials and approved signing flow. Explicit operator action required; GitHub Actions workflow must not launch worker merely because a PR is opened.

**C — Two end-to-end missions and review:** run separate authorized disposable attempts, capture immutable artifacts, verify exact-head CI and draft PRs, rehearse interruption, obtain independent review and record certification.

**Stop condition:** until B and C succeed, MB-03 remains **NOT CERTIFIED**. This document grants no new execution authority.

## MB-03.1 trusted worker and independent verifier

The controller uses the existing runner and lease. The remote adapter takes a deployment-pinned authority ID and a pinned Ed25519 provider public key. The provider receives a mission, fence and finite deadline. The contract sends neither the operator approval nor local paths or credentials. A signed provision must bind the exact mission, worker, repository, SHA and sorted path scope to one sandbox, the reviewed isolation profile, and short-lived credentials. The signed return binds the same fence and sandbox to a file manifest. Build finalization checks the active lease in the same transaction as BUILD evidence. Timeout, approval revocation and a failed authority heartbeat abort the adapter and request idempotent disposal. A late return cannot fill in BUILD.

Use a single authoritative controller deployment and private state volume. Independent local controller processes can share that volume. Remote jobs use the provider interface and receive no state mount. Do not replicate or restore the file as a second live authority. The JSON store has no distributed consensus or cross-host failover protocol. If the store is unavailable, renamed, or reports another authority ID, dispatch fails closed. Complete a separate deployment review before enabling a production provider.

The provider contract requires an authenticated control-plane channel, an ephemeral VM or comparable reviewed isolation boundary, detached pinned Git checkout, writable exact file mounts and private scratch, no controller/Genesis/host/production mounts, and a scoped provider credential injected inside the sandbox. The provider control plane keeps the signing key outside the guest. Credentials and the sandbox must expire independently when their signed deadline elapses, including if the controller disappears. Successful termination revokes credentials and removes the sandbox and scratch. The existing Codex implementation adapter can be called within that sandbox through the provisioned job entry. Its local checks do not establish sandbox provenance. The fixture provider is opt-in and the verifier preserves its fixture identity.

The independent verifier uses a separate pinned key and verifier-owned checkout. It checks the original authorization, persisted plan, provider receipt, returned bytes, proposal parent and diff, required test attestations and log hashes, and documentation and verification artifact hashes. GitHub is queried read-only for the exact draft and workflow-dispatch run, with a pinned workflow definition, job and exact SHA. The four final stage records are appended atomically. Signed evidence and digests are stored in a private, write-once content-addressed archive with a configurable retention period of at least 90 days. Deployment still needs access-controlled backup and retention enforcement. The archive does not store raw worker output, test logs, approval secrets or credential material.

The provisioner, isolation profile, credential issuer, and independent verifier signing service have no live deployment in this change. Fixture signatures and GitHub metadata checks carry no mission execution or certification authority.
