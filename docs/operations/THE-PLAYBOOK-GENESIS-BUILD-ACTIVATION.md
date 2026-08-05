# The Playbook — Genesis Build Activation

Status: READY FOR HUMAN VALIDATION

## Purpose

Activate `PLAYBOOK-SYSTEM-001` through the PBOS Genesis terminal and generate governed education-domain work without importing The Playbook application code into PBOS Core.

## Implemented path

```text
pbos activate playbook
  → The Playbook (preselected by stable system identity)
  → Select authority mode
  → Inspect repository and create build plan
  → Prepare application build
  → agent/pbos-playbook-system-001-vertical-slice
  → Draft pull request
  → GitHub validation evidence
  → Human certification
```

The blueprint binds the public name **The Playbook** to the stable identities `PLAYBOOK-SYSTEM-001`, `PLAYBOOK-OS-001`, and repository `sgwalton87/playbook-platform`.

The generated first slice contains:

- Supabase row-level-security foundation for Scholar profiles, goals, and milestones
- governed identity verification
- Scholar goal capture
- approved onboarding-to-dashboard projection
- The Playbook brand provenance
- CI and dependency-lock preparation

## Operator launch

After the PBOS Core validation gate passes and this implementation is merged, use the direct governed activation command:

```bash
git switch main
git pull origin main
npm ci
npm link
pbos activate playbook
```

The equivalent repository command is `npm run pbos:build:playbook`. Select the approved authority mode, authorize the session, inspect and approve the plan, then prepare the build. Protected actions—including merge, production deployment, secrets, destructive migrations, cross-repository work, and certification—remain human-controlled.

The command does not silently self-authorize The Playbook. PBOS Genesis may execute delegated work only after authenticated operator approval and only inside the issued branch-scoped grant.

## Validation gate

```bash
npm run typecheck
npm run test:run
npm run build
```
