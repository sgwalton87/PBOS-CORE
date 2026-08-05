# Genesis System Factory Console

Run `npm run pbos` to enter the factory, choose **Build or continue an existing application**, and explicitly select The Playbook or Bulletproof Beneficiary. Choose **Create and register a new operating system** only for a new product intake.

Use a direct shortcut when the application is already known:

```bash
npm run pbos:build:playbook
npm run pbos:build:bulletproof
```

The shortcuts skip only the application-selection question. They do not skip authority selection, batch selection, governance, validation, certification, or other protected gates. Commands named `pbos:activate:*` operate the deployed staging connector/runtime and are not application-build commands.

The initial catalog contains The Playbook and Bulletproof Beneficiary as independent applications. Selecting a system does not transfer its domain behavior into PBOS Core; it binds the terminal session to that system identity, repository, and operating-system instance.

The terminal uses the same control-plane contracts intended for the future PBOS Marketplace / Factory Portal.

New-system intake produces a reviewable `SystemBlueprint` containing mission, users, outcomes, domain pack, capabilities, application strategy, governance, autonomy, data policy, palette, accessibility evidence, and design tokens. Brand discovery also accepts a logo card, logo/app-icon references, tagline, approved typography, and usage guidance. A future web intake can upload assets to governed storage and submit the resulting durable references through this same interface-neutral contract. It does not deploy directly from questionnaire answers.

Application scaffolds are materialized as one reproducible unit. PBOS writes the source, TypeScript configuration, Next.js entry point, tests, CI configuration, design tokens, and `src/design/brand-source.json`; generates `package-lock.json`; and commits the complete path set together so generated CI can use `npm ci` immediately. Brand asset references are included in build-plan provenance and remain separate for every generated product.

## Partner CLI

From a PBOS Core checkout:

```bash
npm ci
npm link
pbos login
pbos
```

`pbos login` requires an authenticated GitHub CLI session and enrolls an organization-scoped PBOS operator. Credentials, catalogs, blueprints, sessions, grants, repository checkouts, and audit evidence are stored under `~/.pbos` with user-only permissions. Set `PBOS_STATE_HOME` to use an alternate state location.

Select Bulletproof Beneficiary, choose a governed authority mode, then inspect and plan or prepare the application on an `agent/*` branch. Preparation opens a draft pull request and stops before the human validation and certification gate.

In Human-Gated Build mode, the operator may explicitly choose **Collect validation evidence and resume remediation**. PBOS imports check evidence and failed logs, persists progress, applies an authorized known deterministic remediation, and pushes the repair. Passing checks produce `READY_FOR_CERTIFICATION`; unknown or repeated failures produce `BLOCKED` for human review.

Remediation is pack-based rather than permanently hardcoded per application. Each project profile selects reusable stack, database, domain, and quality packs. Bulletproof currently selects Node dependency, Next.js, Supabase, and legacy-planning packs; future projects register a blueprint and pack identifiers without creating a separate remediation engine.

The workflow menu remains active after each action. Operators can plan, prepare the build, collect validation evidence, and resume remediation in one launch; PBOS recommends the next action until the operator explicitly exits or reaches a governed blocker.

Exit now produces a session summary and Markdown memo under `~/.pbos/memos/<SYSTEM-ID>/`. Use `pbos memo` to read the latest briefing and `pbos status` to see the latest validation/background state. For unfinished validation, the exit prompt can launch an explicitly authorized background monitor; logs are stored under `~/.pbos/logs/`.

## Autonomous batches

Delegated Autonomous Build first prints every incomplete work package discovered in the current plan. It then offers the next one, the next five when available, or all remaining work packages up to ten. Building all remaining packages within the governance ceiling is the clearly labeled recommended default. PBOS prints the selected package names and the exact number remaining after the batch before requesting one start confirmation.

PBOS also prints capabilities already completed on the governed default branch. Completion requires repository evidence for implementation, tests, and the PBOS capability marker. Work-package IDs remain stable across plans, and PBOS refuses to create another batch while the same system has an active or blocked autonomous batch. This prevents completed Scholar foundations or other sections from being regenerated on every launch.

Once confirmed, PBOS creates one governed branch and draft pull request for the selected package set, monitors GitHub Actions automatically, applies registered deterministic remediations, and stops once at `READY_FOR_CERTIFICATION` or `BLOCKED`.

The operator does not need to repeatedly select evidence collection. PBOS writes every transition to durable state and the session memo, resumes unfinished monitors on the next launch, and sends a macOS notification when the batch is ready or blocked.

The durable telemetry ledger records `BATCH_STARTED`, `WORK_PACKAGE_QUEUED`, `WORK_PACKAGE_STARTED`, `WORK_PACKAGE_COMPLETED`, `SECTION_COMPLETED`, `VALIDATION_STARTED`, `REMEDIATION_STARTED`, `BATCH_READY_FOR_APPROVAL`, and `BATCH_BLOCKED`. Both `pbos watch` and `pbos memo` render this timeline.

```bash
pbos status
pbos watch PLAYBOOK-SYSTEM-001
pbos memo PLAYBOOK-SYSTEM-001
```

Protected operations remain human-controlled: certification, merge, production deployment, secrets, destructive migrations, and cross-repository work.
