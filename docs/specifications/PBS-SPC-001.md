---
id: PBS-SPC-001
title: Artifact Naming and Identity
version: 1.0.0
status: Canonical
classification: Specification
constitutional_tier: Core
constitutional_authority:
  - PBS-CON-000
depends_on:
  - PBS-SPC-000
owner: PBOS Core
machine_version: 1
release_blocking: true
validation_required: true
---

Artifact Naming and Identity

═══════════════════════════════════════════════════════════════════════════════

Authority

This specification establishes the canonical identity system governing every artifact within PBOS.

---

Purpose

Every artifact shall possess one permanent identity.

Identity shall never depend upon file names.

Identity shall never depend upon repository paths.

Identity shall remain globally unique.

---

Identity

Every artifact shall possess:

a globally unique identifier;

a canonical title;

constitutional authority;

engineering ownership;

version history;

engineering lineage;

validation status;

certification status.

---

Naming Convention

Artifacts shall follow the canonical pattern.

PBS-[DOMAIN]-NNN

Examples

PBS-CON-000

PBS-VSN-004

PBS-SPC-001

PBS-ARC-015

PBS-ENG-042

Identity shall remain immutable.

Titles may evolve.

Identifiers shall not.

---

Definition of Done

Artifact identity is complete when every engineering artifact possesses one globally unique, deterministic constitutional identity.

