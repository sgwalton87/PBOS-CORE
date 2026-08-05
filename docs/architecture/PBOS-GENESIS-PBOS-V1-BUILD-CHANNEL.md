# PBOS Genesis → PBOS v1 Application Build Channel

## Executive architecture

PBOS Genesis is the factory and operator control surface. PBOS v1 is the governed operating-system boundary. The Playbook and Bulletproof Beneficiary are independent applications connected through their own manifests, domains, identities, repositories, data, brands, and release approvals.

```text
Operator terminal
      │ one build intent
      ▼
PBOS Genesis
  identity ─ session ─ grant ─ blueprint ─ mission queue ─ adapter registry
      │ governed build channel
      ▼
PBOS v1
  OS identity ─ connector contract ─ domain contract ─ authority ─ provenance
      │ bounded repository work
      ▼
Application repository
  exact revision ─ agent branch ─ implementation ─ tests ─ draft PR
      │ independent evidence
      ▼
Validation ─ remediation ─ preview ─ human certification ─ merge ─ release
```

## One command from the operator's perspective

```bash
pbos build playbook
```

or, without a linked binary:

```bash
npm run pbos:build:playbook
```

The command must:

1. authenticate the operator;
2. select The Playbook without another application menu;
3. open or reuse a non-expired governed build grant;
4. verify that `PLAYBOOK-SYSTEM-001`, `PLAYBOOK-OS-001`, `PLAYBOOK-CONNECTOR-001`, the Scholar domain, and `sgwalton87/playbook-platform` form one non-crossed channel;
5. resolve the next dependency-satisfied mission;
6. obtain a signed human decision when the mission requires one;
7. execute only through an explicitly registered adapter;
8. publish changes from the governed revision to an `agent/*` branch and draft pull request;
9. stream durable stage telemetry in the same terminal while validation and bounded remediation continue;
10. present certification and merge as an in-terminal protected checkpoint, continue after an affirmative signed decision, and otherwise stop safely;
11. always stop separately for production deployment, secret management, destructive migration, external-account work, or a missing adapter;
12. ultimately record exact-commit desktop and mobile preview links before launch certification.

## Responsibility boundaries

| Layer | Owns | Must not own |
|---|---|---|
| PBOS Genesis | intake, compilation, planning, session authority, adapter selection, repository dispatch, evidence orchestration | Playbook or Bulletproof product behavior |
| PBOS v1 | OS identity, connector/domain contracts, runtime authority, intelligence, lifecycle communication, provenance, observations | application UI or application repository ownership |
| Application adapter | translation from a governed mission into repository-specific work | authority escalation, certification, merge, secrets, or production deployment |
| Application repository | domain experience, routes, durable application data, tests, CI, web/mobile delivery | PBOS kernel or factory internals |
| Human operator | protected approvals, certification, merge, production and store decisions | repetitive polling or low-level orchestration |

## Enforced invariants

- A build cannot begin with read-only authority.
- System, OS, connector, domain, and repository identities must agree before mutation.
- Every production run carries the build-channel ID and PBOS v1 lineage in durable telemetry.
- A mission without a registered execution adapter stops before repository mutation.
- Application connectors cannot self-authorize protected operations.
- Repository changes originate from an exact governed revision and use an `agent/*` branch.
- Validation evidence is collected independently from implementation.
- A green build is not certification, and certification is not production deployment.
- Playbook and Bulletproof channels can share PBOS v1 contracts without sharing application behavior or data.

## Current execution coverage

The Playbook channel has registered execution adapters for repository gap analysis, the CIP-048 foundation, and the Scholar onboarding-to-dashboard vertical slice. Later CIP-048 product journeys, web staging, CIP-049 mobile delivery, and CIP-050 ecosystem certification remain explicit queue items and must receive certified adapters before PBOS reports them as executable.
