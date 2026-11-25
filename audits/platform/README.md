# PBOS + Playbook — Executable Evidence Audit (v1)

**Status: `BLOCKED_NOT_LAUNCH_CERTIFIED`.** This package is an executable *audit evaluator*, **not** a production launch approval, not an autonomous repair system, and not proof that no other defects exist.

Captured on **2026-11-25 UTC** (2026-11-24 Pacific). Based on the supplied 106-item register and directly inspected GitHub, Cloud Run GitHub logs, connected Vercel, Supabase and Neon data. All source files and evidence observations are versioned; raw credentials or protected secret values were **not** collected.

## Run it (Node 22+, no Docker or paid product)

```bash
node --test tests/*.test.mjs
node audit.mjs --register register.json --observations evidence/observations.json --out results/current
```

**Exit code 0:** all required conditions are eligible for independent review (does **not** grant launch/mission authority). **Exit 2:** blocked, including failures and missing evidence. **Exit 3:** invalid inputs or broken audit. The current evidence is expected to yield **exit 2**—that's an honest, successful detection, not a broken test harness.

Outputs: `results/current.json` and `results/current.md`, with SHA-256 digests of the exact input bytes; these digests provide reproducibility, **not signatures or attested cloud origin**. The snapshot becomes **stale after 24 hours**; do not keep reusing it to pass release gates.

## What is inside

| File | Purpose |
|---|---|
| `register.json`, `register.csv` | All 106 original IDs, risk tiers, classifications, source links, closure criteria, proposed owner roles and dependencies. No silent item closure. |
| `input/PLAYBOOK_PLATFORM_FULL_SYSTEMS_GAP_REGISTER_2026-11-24.md` | Exact baseline source, SHA-256 recorded in `register.json` |
| `evidence/observations.json` | Sanitized dated live and reported observations with origin IDs; no secrets |
| `evidence/sources.json` | Evidence/source inventory and provenance limitations |
| `evidence/supabase-advisor-object-inventory.md` | Nine advisor categories, 254 individual object findings, link to their sanitized object-level snapshot in PBOS-CORE |
| `audit.mjs` | Deterministic, offline, fail-closed release gate evaluator |
| `tests/audit.test.mjs` | Missing evidence, bad registry, falsified completion, stale snapshots and environment mismatch tests |
| `forensics/cloudrun-5dhzb.mjs` | Read-only Cloud Run job/execution JSON forensic analyzer; no credential access |
| `tests/forensics.test.mjs` | Negative tests for image drift, old secret path, missing wrapper, incomplete generation |
| `github-workflows/pbos-cross-stack-forensics-readonly.yml` | Template for protected staging `gcloud run jobs describe` and historical execution describe only |
| `FORENSIC_REPORT.md` | Root-cause proof, remaining evidence, limitations and nonmutation status |
| `SYSTEMS_MAP.md` | Dependency diagram, authority boundaries, service owners and source maps |
| `results/current.*` | Reproducible, executed blocked audit result |

## Evidence classification: definitions matter

- **Confirmed observed:** A live provider/CI/source observation proves a specific mismatch **at its captured time**. It may have changed since.
- **Operator reported:** Incident facts supplied by the operator, not independently verified through the source of record. Cannot certify closure.
- **Advisory:** A provider linter flagged an object. Not necessarily an exploit or malfunction; review the concrete function/policy/index.
- **Unverified / certification open:** The closure test has not been executed and accepted for the exact intended environment/revision. It is **not** a claim the feature is missing.
- **Limited pass:** A narrow control passed (e.g., local role E2E or nonmission Cloud Run readiness) but does not certify adjacent controls.

## Non-negotiable release prerequisites

1. **Mission controller**: select one independently reviewed 64-character digest. Prove exact approved image vs current job, reconciled job generation, reviewed private secret staging, scoped writable synthetic state, no duplicate private signer, and separately attested runtime permissions before a signature.
2. **Mission chain**: fresh separately scoped signed approval only after the complete nonmission contract passes; audit actual execution image and bound state, fenced lease, worker, reviewable PR and durable independent evidence. 0/2 mission completions currently evidenced.
3. **Playbook app**: independently configure server-side production PBOS connector and per-journey approvals (do not copy Preview keys). Prove accepted source SHA in Vercel production and custom domain; certify 15 role positive and negative journeys.
4. **Database & operations**: source↔hosted migration parity, all advisor dispositions, authenticated role/relationship denial tests, email/OAuth/revocation, backup recovery, monitoring and rollback before a separate human launch decision.

## Closure attestation schema

Each item begins **NOT_CLOSED** even when an associated source exists. For a closure claim, add a scoped `closureEvidence[G-###]` in `observations.json` containing exact `findingId`, `result=PASS`, external `testRunLocator`, `evidenceSha256`, independent `reviewerId`, `reviewedAt`, accepted `releaseCommitSha`, and one allowed `evidenceSourceId`. The evaluator checks structure and scope. **A self-provided record is not cryptographic proof**; a qualified independent reviewer must also check the provider's immutable execution evidence. `releaseStatus` never authorizes production or a signed mission.

## Safety and operational access

- No Docker requirement on your computer. No secrets in the audit snapshot or screenshots.
- This package makes **zero** changes to GCP, GitHub, Vercel, Supabase, Neon, production or Genesis while running offline.
- The GCP forensic GitHub workflow is intentionally separate, and is not run until code review/merge and the protected staging environment reviewer approves its **read-only** GCP inspection. Its Cloud Run step is `describe`, not `execute`.
- Do not use a historical failed execution as the future approved controller image.
- The signed mission failures `s7mkp` and `5dhzb` do not count toward the 10 signature-free diagnostic executions; only one previously verified readiness execution did.

## Scope still not completed

Full Cloud Run historical `5dhzb` execution JSON, real runtime `0400` file-mode attestation in the signed-job path, private IAM/Secret Manager bindings, production user login through all 15 role journeys, email deliveries, Google OAuth admin configuration, provider-issued recovery/rollback receipts, and final independent human certification remain **unavailable or unverified**. This is explicitly reported as blockers, never assumed working.