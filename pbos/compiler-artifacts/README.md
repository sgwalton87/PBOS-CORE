---
id: PBOS-ARTIFACT-000
title: Compiler Artifact Model
version: 1.0.0
status: Canonical
classification: Constitutional
owner: PBOS Genesis
---

# Compiler Artifact Model

The Compiler Artifact Model defines the immutable objects exchanged between
every compiler stage in PBOS Genesis.

Compiler stages SHALL consume immutable artifacts and SHALL produce new,
immutable artifacts.

Artifacts preserve:

- Identity
- Lineage
- Certification
- Validation
- Serialization
- Replayability

## Artifact Pipeline

Session

↓

Evidence

↓

Knowledge Graph

↓

Organization Understanding

↓

PIR

↓

COIR

Every compiler stage refines the representation without mutating previous
artifacts.
