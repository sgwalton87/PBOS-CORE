---
id: PBS-6000-004
title: Supabase Architecture
version: 1.0.0
status: Canonical
classification: Engineering Constitution
owner: PBOS
parent: PBS-6000
---

# Purpose

Supabase provides the canonical operational data platform for Playbook.

Supabase governs persistent platform state.

---

# Responsibilities

Supabase governs:

- Authentication
- Authorization
- PostgreSQL
- Storage
- Realtime
- Row Level Security
- Edge Functions
- Database Migrations

---

# Validation

PBOS shall verify:

- Schema integrity
- Migration ordering
- Generated types
- Authentication
- Authorization
- Storage
- RLS
- Realtime
- Edge Functions

---

# Implementation Mapping

Supabase implementation shall map to:

- Authentication services
- Database services
- Storage services
- Runtime data layer

---

# Constitutional Rule

Supabase is the canonical operational data authority.

Repository schemas shall converge with live infrastructure.

---

# PBOS Responsibilities

PBOS continuously validates Supabase against repository state.

---

# Definition of Done

Supabase remains constitutionally synchronized with Playbook.

## Executable Supabase requirements

Supabase owns application authentication, PostgreSQL schema, migrations, RLS, Storage, Realtime, and Edge Functions where declared. PBOS shall validate:

- project identity and environment;
- ordered, idempotent, non-destructive migrations;
- schema visibility through both PostgreSQL and PostgREST;
- RLS and storage policies for the tested persona;
- authentication and durable-data behavior through executable acceptance;
- separation of staging and production.

A migration command returning zero is insufficient. The intended tables, policies, storage objects, and API-visible schema must be observed before PBOS reports readiness.
