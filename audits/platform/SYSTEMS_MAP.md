# Evidence-backed complete-system dependency map

```mermaid
flowchart TB
 subgraph GOV[Human and PBOS governance]
  CON[Constitution / PPS Canon]
  HUM[Independent human approval and mission signature]
  GA[Mission planner, scope, source and nonce]
  CON --> GA
  HUM --> GA
 end
 subgraph BUILD[GitHub / protected artifact release]
  COR[PBOS-CORE exact source commit]
  CI[Offline build and security CI]
  REG[Artifact Registry immutable sha256 image]
  RDB[Read-only release evidence manifest]
  COR --> CI --> REG --> RDB
 end
 subgraph CLOUD[GCP staging / signed mission]
  RD[Separate Cloud Run readiness job - historical PASS]
  SJ[Signed Cloud Run mission job - configuration drift BLOCKED]
  SEC[Secret Manager root owned mounts]
  STAGE[Root bootstrap to private node-owned 0400 files]
  PCS[PPS Canon and sealed GCS snapshot]
  NS[Scoped writable synthetic GCSFuse state]
  LEASE[Neon fenced lease / nonce / durable journal]
  REG --> RD
  REG --> SJ
  RDB --> SJ
  SEC --> STAGE --> SJ
  PCS --> SJ
  NS --> SJ --> LEASE
 end
 subgraph EXEC[Isolated engineering execution]
  BRO[Model broker and scoped model lease]
  WS[Vercel Sandbox/Codex worker]
  REV[Independent evidence / diff / PR]
  LEASE --> BRO --> WS --> REV
 end
 subgraph APP[Playbook release]
  PR[playbook-platform pull request and CI]
  RLS[Approved app release candidate]
  VER[Vercel production deployment / custom domain]
  UI[Next.js authenticated application and 15 role dashboards]
  SUP[Supabase Auth, Postgres RLS, Storage, migrations]
  REV --> PR --> RLS --> VER --> UI
  UI <--> SUP
 end
 GA --> SJ
 UI -. 'Production PBOS connector settings absent' .-> GA
 SJ -. 'Image/secret boundary failure before worker' .-> BRO
 RD -. 'Readiness alone does not certify signed job' .-> SJ
```

## Actual authority boundaries

| Boundary | Expected contract | Current independently supported result | Evidence |
|---|---|---|---|
| GitHub → Artifact Registry | Image built/tested, full immutable sha256 retained | Nonmission readiness image published and executed | SRC-GCP-READINESS |
| Registry → signed job | Approved exact digest equals reconciled signed-job digest | **Failed audit:** signed image differs from readiness pin; historical execution differed from current job | SRC-GCP-AUDIT |
| Managed secrets → signed controller | Root copies managed files to `0400` regular files, then drops to node | Script exists; **deployed signed job path differs**; runtime `5dhzb` mode failure is operator reported | SRC-GCP-CONTROL; SRC-GCP-AUDIT; SRC-GCP-OPERATOR |
| Mission job → Neon/GCS | Private disposable scoped state; read-only Canon; signed nonce and fenced lease | Signed execution-state read/write policy differs; full fenced mission unproven | SRC-GCP-AUDIT; SRC-NEON |
| Signed controller → model broker → Sandbox | Only signed approved mission can dispatch; output independently reviewed | Last incidents failed before admission; 0/2 completed | SRC-GCP-OPERATOR |
| GitHub application main → Vercel | Accepted revision deployed exactly and promoted | Main Git deployment disabled; last production deployment behind main | SRC-APP-VERCEL-CONFIG; SRC-APP-REPO; SRC-VERCEL-PROJECT |
| Vercel runtime → PBOS API | Production endpoint, organization, connector signing, per-journey approvals | **Absent** from current production Vercel env key inventory | SRC-VERCEL-ENV; SRC-APP-REPO |
| App user → Supabase Auth/RLS | Owner identity and appropriate approved role/relationship permissions | 166 public tables RLS enabled; 254 linter findings need per-object review; complete 15-role production E2E not proven | SRC-SUPABASE-PROJECT; SRC-SUPABASE-ADVISORS; SRC-APP-QA |
| CI → production user acceptance | Safe exact-release all-role journeys including denials, recovery, return login | Isolated local QA passed; latest production main QA blocked at config | SRC-APP-QA-LOCAL; SRC-APP-QA |
| Release → operational governance | Live ledger, observability, rollback, human acceptance | Old 207-task tracker has no owners/dependencies; no certified rollback | SRC-PROJECT-TRACKER |

**Identity labels are not equivalent to actual operating readiness.** Approved PR ≠ deployed job ≠ runtime mode ≠ executed mission ≠ accepted Playbook release ≠ 15 working roles.