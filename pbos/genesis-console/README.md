# Genesis System Factory Console

Run `npm run pbos` to select a registered PBOS-powered system and activate a governed build session, or choose **Create New Operating System** to complete the system and brand intake.

The initial catalog contains Playbook Platform and Bulletproof Beneficiary as independent applications. Selecting a system does not transfer its domain behavior into PBOS Core; it binds the terminal session to that system identity, repository, and operating-system instance.

The terminal uses the same control-plane contracts intended for the future PBOS Marketplace / Factory Portal.

New-system intake produces a reviewable `SystemBlueprint` containing mission, users, outcomes, domain pack, capabilities, application strategy, governance, autonomy, data policy, palette, accessibility evidence, and design tokens. It does not deploy directly from questionnaire answers.

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
