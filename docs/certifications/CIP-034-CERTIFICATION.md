# PBOS-CIP-034 Certification

## Status

READY FOR CERTIFICATION

## Universal Remediation Pack Architecture

CIP-034 replaces per-project remediation engines with a shared `UniversalRemediationHandler`. Projects register a small profile containing system identity, repository boundary, blueprint factory, and selected remediation-pack identifiers.

## Standard Packs

- `@pbos/remediation-node-dependencies`
- `@pbos/remediation-nextjs`
- `@pbos/remediation-supabase`
- `@pbos/remediation-legacy-planning`

Packs independently detect supported failure evidence and contribute non-conflicting changes. The universal handler rejects unknown projects, repository mismatches, missing packs, conflicting file output, and empty remediation changes.

## Project Composition

Bulletproof now composes the four standard packs through `BULLETPROOF-SYSTEM-001`. A second project can reuse any subset by registering configuration; no new handler class is required. The former `BulletproofRemediationHandler` remains only as a backwards-compatible facade.

## Tests Prepared

- Reuse by an independent second project
- Stack/domain separation
- Dependency-only remediation
- Unknown-project rejection
- Unknown-pack rejection

## Validation Commands Ready

```bash
npm run typecheck
npm test
npm run build
```
