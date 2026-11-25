# PBOS + Playbook — Executable Evidence Audit (v1)

**Status: `BLOCKED_NOT_LAUNCH_CERTIFIED`.** This package is an executable *audit evaluator*, **not** a production launch approval, not an autonomous repair system, and not proof that no other defects exist.

Captured on **2026-11-25 UTC** (2026-11-24 Pacific). Based on the supplied 106-item register and directly inspected GitHub, Cloud Run GitHub logs, connected Vercel, Supabase and Neon data. All source files and evidence observations are versioned; raw credentials or protected secret values were **not** collected.

## Run this repository-backed audit (Node 22+, no local Docker)

```bash
cd audits/platform
node --test tests/audit.nodecheck.mjs mb03-5dhzb.nodecheck.mjs
node audit.mjs --register register.json --observations evidence/observations.json --out results/current
```

**Exit 2** means launch is correctly blocked by the observed evidence; **exit 3** means audit input or harness error. The runner writes only local report JSON/Markdown and never signs, deploys or executes a cloud job. The CI workflow at `../../.github/workflows/pbos-platform-evidence-audit.yml` expects the blocked result and uploads a sanitized report; green CI here proves the **harness** behaved correctly, not launch readiness.

## Repository audit files

| File in this PR | Evidence function |
|---|---|
| `register.json`, `register.csv` | All 106 original numbered gaps, preservation of source classification, source ID, closure proof, ownership/dependency proposals |
| `audit.mjs`, `tests/audit.nodecheck.mjs` | Exact evidence, stale snapshot, missing proof and negative-case certification evaluator |
| `evidence/observations.json` | Provider-connector/CI sourced, sanitized environment snapshot. No secret values. |
| `evidence/supabase-advisor-2026-11-25.json` | All 254 individual Supabase advisor observations, including object metadata and timestamps |
| `mb03-5dhzb-forensic.mjs`, `mb03-5dhzb.nodecheck.mjs` | Offline forensic parser and negative tests for historical Cloud Run image and private secret-staging paths |
| `SYSTEMS_MAP.md`, `FORENSIC_REPORT.md` | Cross-stack authority and release DAG with explicit limitations |
| `../../.github/workflows/mb03-5dhzb-readonly-forensics.yml` | Protected GitHub Actions **read-only** GCP job/execution describe, after approved merge |

The original 106-item Markdown baseline, the July project JSON, offline HTML dashboard, input SHA-256 manifest and full reproducible distribution are preserved in the separately delivered audit package. These private historical source attachments are **not** unnecessarily copied into the public repository.

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