# PBOS Engineering Memory

PBOS Engineering Memory promotes milestone history from application-specific scripting into a shared Genesis capability. Every new application scaffold and every existing-application overlay receives the same governed Archivist assets.

## Universal contract

A qualifying commit begins with `Milestone:`. The Archivist records the system identity, repository, exact revision, validation evidence, progress snapshot, SHA-256 digest, and lineage. Failed validation is recorded as `VALIDATION_FAILED`; it is never represented as certified evidence.

Generated applications receive:

- `.pbos/archivist.json` — system-specific configuration;
- `scripts/pbos-archive-milestone.mjs` — portable evidence and snapshot collector;
- `.githooks/pbos-archivist-post-commit` plus an explicit installer for immediate local feedback;
- `.github/workflows/pbos-engineering-memory.yml` — clone-independent CI execution and durable workflow artifacts;
- milestone, snapshot, latest-snapshot, and founder-journal destinations.

Existing applications retain any milestone index they already own; PBOS never replaces it. The generated collector appends new references. New applications receive a starter index.

Run `node scripts/pbos-install-archivist.mjs` once per local clone to enable the optional post-commit experience. The installer preserves an existing `post-commit` hook and appends one idempotent PBOS dispatcher, so an application's current automation is not replaced. The CI workflow remains the portable source of automatic execution because Git hook configuration is intentionally not inherited by Git clones.

## Governance boundary

Post-commit automation is evidence collection, not a merge or certification gate: the commit already exists when a post-commit hook runs. Protected merges, releases, and certification continue to require PBOS evidence evaluation and the configured human approval. Generated records are not silently amended into the triggering commit; they remain reviewable outputs, while CI preserves them as an immutable workflow artifact.

The capability contains no Playbook or Bulletproof business logic. Domain systems supply only their identity, repository, progress data, and validation commands through the generated configuration.

The Bulletproof Claims Decision Engine remains application/domain-owned. PBOS may plan, authorize, build, validate, and archive its delivery, but the claim rules themselves are not promoted into the universal foundation.
