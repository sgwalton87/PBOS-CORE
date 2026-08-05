# Genesis System Factory Console

Run `npm run pbos` to select a registered PBOS-powered system and activate a governed build session, or choose **Create New Operating System** to complete the system and brand intake.

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

After GitHub Actions starts on the draft PR, relaunch `pbos`, activate the same system, and choose **Collect validation evidence and resume remediation**. PBOS imports check evidence and failed logs, persists progress, applies a known deterministic remediation when authorized, and pushes the repair. Re-enter the action after checks rerun. Passing checks produce `READY_FOR_CERTIFICATION`; unknown or repeated failures produce `BLOCKED` for human review instead of an autonomous loop.

Remediation is pack-based rather than permanently hardcoded per application. Each project profile selects reusable stack, database, domain, and quality packs. Bulletproof currently selects Node dependency, Next.js, Supabase, and legacy-planning packs; future projects register a blueprint and pack identifiers without creating a separate remediation engine.

The workflow menu remains active after each action. Operators can plan, prepare the build, collect validation evidence, and resume remediation in one launch; PBOS recommends the next action until the operator explicitly exits or reaches a governed blocker.

Exit now produces a session summary and Markdown memo under `~/.pbos/memos/<SYSTEM-ID>/`. Use `pbos memo` to read the latest briefing and `pbos status` to see the latest validation/background state. For unfinished validation, the exit prompt can launch an explicitly authorized background monitor; logs are stored under `~/.pbos/logs/`.
