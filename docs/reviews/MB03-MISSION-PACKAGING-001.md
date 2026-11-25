# MB-03 complete mission-package boundary

The protected Playbook Cloud Run job consumes a `PrivateMissionFile`, not the
custodian's signed approval envelope alone. The failed Mission 001 attempt was
stopped before admission because only `{payload, signatureBase64}` had been
placed at `PBOS_MISSION_INPUT_FILE`; the required request, disposable mission,
scope, and exact before/after target were absent.

`pbos/tools/mb03-mission-package.ts` is a local-only packaging utility. It:

- verifies the checkout is at the signed source SHA;
- verifies the approval lineage and (when supplied) the registered public key;
- reads the exact tracked `before` file and an operator-provided proposal file;
- checks the proposal bytes against the signed content digest;
- constructs the existing `ProductionMissionRequest`, `Mb03Mission`, scope, and
  `PlaybookRemoteTarget` contracts; and
- writes one mode-0600 package without handling or uploading private key material.

The worker still performs its own complete validation. A package is not an
approval, does not upload itself, and does not dispatch a mission. A new
mission-specific signature and protected execution authorization are required
after this repair is reviewed and deployed.
