# CIP-050 — Multi-Platform Ecosystem Certification

## Status

FINAL CERTIFICATION ADAPTER READY — EXACT-REVISION APPLICATION PREVIEWS AND HUMAN CERTIFICATION PENDING

## Purpose

CIP-050 closes the current CIP-045 through CIP-050 launch program by proving that one PBOS v1 contract foundation powers two independently owned application families:

- The Playbook across responsive web, iOS, and Android
- Bulletproof Beneficiary across responsive web, iOS, and Android

## Certification standard

Each application must independently provide valid privacy, identity, authority, provenance, accessibility, security, operational, and commercial evidence for every platform. Each platform also requires its own human approval identifier and an issuer distinct from the application and system being approved.

The ecosystem report additionally requires:

- the same PBOS v1 contract version
- separate repositories
- separate brand identities
- separate data-ownership boundaries
- separate release authorities
- exact application revisions
- complete evidence provenance and lineage
- separate human certification identifiers for Playbook and Bulletproof

Apple and Google review outcomes are external evidence. They are never represented as PBOS-issued approvals.

## Fail-closed boundaries

- Missing or invalid evidence blocks the affected platform.
- Missing web-promotion or store-submission approval blocks the affected platform.
- Shared repository, brand, data, or release ownership fails ecosystem independence.
- One application cannot self-authorize its authority evidence.
- One system's certification cannot certify the other.
- Store submission and public promotion remain protected actions after certification readiness.

## Operator command

```bash
PBOS_ECOSYSTEM_CERTIFICATION_PATH=/protected/path/cip-050-candidates.json npm run pbos:certify:ecosystem
```

PBOS production missions also accept the durable default source at
`~/.pbos/evidence/cip-050-candidates.json`. Before starting the automated
`050-platform-evidence` mission, PBOS parses this source and fails closed when
either system, platform, readiness domain, or independent approval is missing.
The execution adapter then independently inspects both governed repositories,
rejects stale revisions, and writes the compiled report to the PBOS audit
ledger without changing either application repository.

The subsequent `050-isolation` mission is also a PBOS-owned platform proof,
not an application-code mission. It accepts only the unchanged candidate
digest from platform compilation, rechecks both governed revisions, and
records explicit checks for shared contract version plus separate system,
application, repository, brand, data-ownership, and release-authority
boundaries. Passing automation stops at a distinct human platform-evidence
certification checkpoint; it does not create a synthetic pull request.

The final `050-certification` mission remains PBOS-owned and fail-closed. Mission
Control now projects the latest valid preview independently for every registered
system by joining the preview manifest to its production run and exact commit.
Simulated, nonvisual, stale-commit, and cross-repository manifests cannot become
application launch actions. A manifest becomes an application delivery proof
only when the same run is awaiting certification or certified, its durable URLs
match the manifest, and exact-revision route, interface, acceptance-test,
independent-validation, and preview evidence all passed. Both The Playbook and
Bulletproof must expose their own proven desktop web and mobile URLs before
final certification can start.

At the final checkpoint, PBOS creates eight distinct signed decisions: one
system certification and separate web, iOS, and Android release-boundary
approvals for each application. The final adapter verifies those signatures,
the previously certified isolation run, the unchanged candidate digest, both
governed repository revisions, and both application preview surfaces. Only then
can it write `CIP_050_ECOSYSTEM_CERTIFIED` to the durable audit ledger. These
decisions do not merge code, submit an app store release, or deploy production.

The command may produce `NOT_READY`, `READY_FOR_HUMAN_CERTIFICATION`, or `CERTIFIED`. The automated platform-evidence mission can complete only for the latter two states. The final state is possible only when both independent human certification identifiers are present and every earlier evidence gate is satisfied.

## Current decision

CIP-050 is not yet certified. The final adapter and tests are prepared for human
validation. Real exact-revision preview URLs for both independent applications,
their signed application/platform decisions, and the distinct final mission
certification remain required.
