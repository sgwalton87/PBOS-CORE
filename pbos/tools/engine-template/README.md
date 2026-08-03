# PBOS Constitutional Engine Template

> Governed by PESS-001

═══════════════════════════════════════════════════════════════════════════════

## Purpose

The Constitutional Engine Template provides the canonical structure used to
create every engine within PBOS Genesis.

It guarantees architectural consistency across the operating system.

═══════════════════════════════════════════════════════════════════════════════

## Generated Artifacts

engine.ts

Implementation contract.

───────────────────────────────────────────────────────────────────────────────

engine.test.ts

Certification contract.

───────────────────────────────────────────────────────────────────────────────

engine.md

Human-readable engineering documentation.

───────────────────────────────────────────────────────────────────────────────

engine.yaml

Machine-readable engine specification.

═══════════════════════════════════════════════════════════════════════════════

## Constitutional Principle

Every Constitutional Engine SHALL begin from this template.

Templates SHALL remain immutable once certified.

All generated engines SHALL conform to PESS-001.

═══════════════════════════════════════════════════════════════════════════════

## Future

The PBOS Engine Factory SHALL materialize these templates automatically.

Example:

pbos create engine MissionGenerator --domain PBS-PLN

↓

MissionGenerator/

    mission-generator.ts

    mission-generator.test.ts

    mission-generator.md

    mission-generator.yaml

