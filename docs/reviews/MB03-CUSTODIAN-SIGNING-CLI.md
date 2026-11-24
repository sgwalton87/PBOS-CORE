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
