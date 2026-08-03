---
id: PBOS-CLI-000
title: PBOS Genesis Command Line Interface
version: 1.0.0
status: Canonical
classification: Constitutional
owner: PBOS Genesis
---

# PBOS Genesis CLI

## Purpose

The PBOS Command Line Interface (CLI) is the constitutional execution
environment for PBOS Genesis.

All executable compiler commands SHALL enter the compiler through the CLI.

The CLI SHALL NOT contain engineering logic.

The CLI SHALL delegate execution to Constitutional Commands.

---

## Responsibilities

• Parse user commands

• Initialize Boot Sequence

• Route commands

• Display output

• Display progress

• Report failures

• Preserve execution context

---

## Supported Commands

pbos discover

pbos compile

pbos engineer

pbos runtime

pbos deploy

pbos certify

---

## Constitutional Law

The CLI SHALL remain presentation-only.

Engineering SHALL occur inside Constitutional Commands.

