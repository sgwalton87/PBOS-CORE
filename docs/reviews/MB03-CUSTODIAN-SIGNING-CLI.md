# MB-03 custodian signing utility

`pbos/tools/mb03-sign-mission.ts` is a local-only utility. It never uploads,
copies, logs, or embeds private key material. The custodian supplies a path to
the already-approved encrypted-volume PEM, unlocks it locally, reviews the
full mission scope, and types `SIGN <mission-id>` for that mission only.

The utility uses the exact array serialization and verification contract in
`hosted-signed-mission-approval.ts`, generates a cryptographically secure UUID,
limits validity to 15 minutes, and verifies the resulting envelope with the
registered public key before printing JSON. It refuses symlinks, group/other
permissions, oversized files, unknown missions, and altered source/scope.

The utility does not activate keys, dispatch missions, or grant authority.
Signed envelopes must be transferred through the approved operator channel.

## Recovery of the interrupted Mission 001

From a reviewed Core checkout with locked dependencies installed, inspect the
candidate offline with `./node_modules/.bin/tsx pbos/tools/mb03-sign-mission.ts --preview-plan-ready`.
This prints the interrupted run and original attempt, state and lock generations,
source, publication base, target, scope digest and public-key pin. Preview reads
no key, creates no nonce and starts no approval window.

Before requesting a signature, the protected readiness job can run
`--verify-recovery-package` with mission execution disabled. It checks the
existing checkpoint, journal, fence and consumed original nonce, authenticates
the historical package against the signature digest recorded on that run, and
compares its target preimage with the regular file at the verified GitHub base.
It requires the original mission input and the existing GitHub App installation
credential supplied by the host. Its receipt is `RECOVERY_PACKAGE_OBSERVED`.
This check exercises reads only. Live fenced handoff and publication require
their own verified controller integration.

Only after that integration, protected review and exact-scope authorization,
the custodian may use the local signer with `--recover-plan-ready` before the
ordinary four arguments. The custodian reviews the complete recovery scope and
enters the displayed run-specific confirmation. The recovered attempt uses a
distinct signature schema and nonce. Signing reads the registered public PEM
and the encrypted private PEM from the unlocked custody volume. Prompts go to
the terminal and only the signed package is written to standard output.
