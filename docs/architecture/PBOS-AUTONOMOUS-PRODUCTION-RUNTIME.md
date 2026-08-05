# PBOS Autonomous Production Runtime and Mission Control

Directive: `PBOS-AUTONOMOUS-PRODUCTION-AND-MISSION-CONTROL-001`

Status: IN PROGRESS — FOUNDATION VALIDATED

## Canonical ownership

PBOS production truth is owned by `GenesisStateRepository` and persisted in the operator-private
`$PBOS_STATE_HOME/genesis-state.json` file (default `~/.pbos/genesis-state.json`). The production runtime does not introduce a second database or manual tracker. It extends the existing durable state with:

- `productionRuns`
- `productionStages`
- `productionEvents`
- `executionLeases`
- `missionQueue`
- `previewManifests`

`ProductionRuntimeService` is the sole transition, lease, heartbeat, recovery, health, metrics, and Mission Control projection owner. `AutonomousBatchService` adapts the existing governed batch and remediation lifecycle into that owner.

## Lifecycle

The implemented runtime follows:

1. authorized production run request;
2. durable execution lease acquisition;
3. deterministic queue/start/run transitions;
4. timed execution stage;
5. durable work-package telemetry;
6. timed validation stage;
7. bounded repair transition when validation is remediable;
8. approval boundary after successful validation;
9. certification only after human approval and governed merge evidence;
10. lease release;
11. readiness mission reconciliation and next-mission selection.

Invalid status transitions throw. A command exit alone does not certify a run. Certification remains protected.

## Status and timing

The canonical vocabulary is declared by `PRODUCTION_STATUSES`. Run and stage records contain wall-clock timestamps, durable heartbeats, terminal timestamps, and calculated millisecond durations. Mission Control derives a one-second visible elapsed timer from the durable start timestamp; it does not rewrite state each second.

Active states require an unexpired execution lease. Leases contain the process, host, actor, scope, repository, branch, commit, renewal time, expiration time, and recovery metadata. Stale lease recovery moves nonterminal work into `RECOVERING`; it never certifies interrupted work.

## Events, logs, and redaction

Production events are append-only, ordered by a durable sequence, correlated by run ID, and include repository, branch, commit, actor, severity, status, summary, and structured payload. Secret-like keys and command fragments are redacted before persistence. Existing bounded per-run monitor logs remain operator-private under `$PBOS_STATE_HOME/logs`.

## Mission queue

`GovernedMissionQueue` validates identifiers, rejects dependency cycles and unknown dependencies, derives eligible work from completed dependencies, and selects the first canonical eligible mission deterministically. The Playbook readiness transition populates CIP-048, CIP-049, and CIP-050 missions after the certified seven-capability foundation.

## Preview evidence

`GovernedPreviewPipeline` creates commit-bound preview manifests. Experience-changing work requires desktop and mobile viewports and remains `REQUESTED` until a live URL or screenshot evidence exists. Nonvisual work is labeled `NONVISUAL`. Seeded or simulated evidence is never represented as live.

The repository currently has no PBOS Core browser-capture dependency. Screenshot capture must therefore execute through the application repository's established browser tooling when its readiness mission runs; PBOS Core records and verifies the resulting manifest.

## Mission Control

Mission Control is a responsive, local-only founder surface served at `127.0.0.1`. It displays:

- connected/disconnected state;
- active or idle status;
- run, mission, branch, commit, stage, elapsed time, heartbeat, and lease;
- live structured events;
- component health and production metrics;
- the next eligible mission and selection rationale.

Polling every two seconds is the canonical local transport. A failed poll displays `DISCONNECTED · STATE UNKNOWN`, never `IDLE`. The UI includes responsive layouts, non-color status text, live regions, keyboard-native controls, and reduced-motion behavior.

## CLI ownership

The reconciled CLI capabilities are:

- `pbos status` / `npm run pbos:status`
- `pbos watch SYSTEM-ID` / `npm run pbos:watch -- SYSTEM-ID`
- `pbos health` / `npm run pbos:health`
- `pbos history` / `npm run pbos:history`
- `pbos inspect RUN-ID`
- `pbos next`
- `pbos run [playbook|bulletproof]` / `npm run pbos:run -- playbook`
- `pbos pause RUN-ID`
- `pbos resume RUN-ID`
- `pbos cancel RUN-ID`
- `pbos preview [RUN-ID]`
- `pbos verify` / `npm run pbos:verify`
- `pbos mission-control` / `npm run pbos:mission-control`

Pause, resume, and cancel require the authenticated operator to own the run. Repository mutation, certification, merge, secrets, deployment, and destructive migration remain protected by existing authority contracts.

`pbos run` selects one dependency-eligible mission, creates a signed operator authorization artifact, records a machine-readable execution plan, and runs only a registered mission adapter. The first registered adapter performs the read-only CIP-048 Playbook repository gap analysis. Autonomous continuation stops before the next human approval boundary or any mission without a certified execution adapter.

## Recovery and verification

Startup-compatible recovery classifies expired leases as stale and moves their runs to `RECOVERING` with a checkpoint. `verify` checks event ordering, event-to-run lineage, and active-run lease presence. Recovery never silently takes over a healthy lease.

## Status reconciliation and migration

Existing `sessions`, `grants`, `autonomousBatches`, `batchTelemetry`, `remediationRuns`, `backgroundJobs`, `memos`, and `audit` records remain preserved. They are canonical inputs or historical evidence, not deleted trackers. New production records are created for new autonomous batches; old batches remain readable without being falsely upgraded. Readiness completion continues to be derived from governed repository evidence rather than manual percentages.

| Artifact | Classification | Owner | Consumer |
|---|---|---|---|
| Production runs/stages/events/leases | Canonical runtime state | Production runtime | CLI, Mission Control |
| Sessions/grants | Canonical authority input | Genesis control plane | Production runtime |
| Autonomous batches/telemetry | Canonical execution evidence | Operator continuity | Production runtime adapter, CLI |
| Remediation runs | Canonical validation evidence | Validation automation | Production runtime adapter |
| Memos | Derived operator briefing | Operator continuity | Founder/operator |
| Mission Control snapshot | Derived read model | Production runtime | Mission Control UI |
| Roadmaps/checklists | Planning input or historical snapshot | Documentation owners | Mission compiler/humans |
| Preview manifest | Canonical result evidence | Preview pipeline | Mission Control/certification |

## Security and data lifecycle

State files are created with operator-only permissions by the existing atomic JSON store. Mission Control binds only to loopback. It exposes curated runtime contracts, not filesystem browsing, environment variables, secrets, or arbitrary commands. Event payloads are redacted and API responses retain repository and run identity.

## Definition of Done and validation boundary

Implementation is ready for the controlled human gate when the listed unit and integration tests, typecheck, and production build pass. Visual browser captures and real application previews remain run-specific evidence and cannot be fabricated by PBOS Core.
