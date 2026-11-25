# MB-03 forensic report — separate evidence and remaining verification

**Investigation scope:** Historical signed mission executions `s7mkp` and `5dhzb`; current signed job; separate readiness job. No mutation, no signing or mission dispatch performed for this report.

## Evidence-based conclusions

1. **Signature-free readiness was real, but only for the separate job.** Cloud Run `pbos-mb03-playbook-readiness-vlzxs` succeeded. GitHub Actions #45504204687, attempt 2, pinned controller digest `95161c3080111b6beca1debd3ec251700413940ab1164c4325aee5455bd859e2`. Nothing here certified the signed mission job.
2. **Live signed-job drift is independently confirmed.** GitHub Actions read-only audit #45512799680, 2026-11-24T23:49:56Z, returned `BLOCKED` with exact codes: `SIGNED_HAS_DUPLICATE_ENV_PRIVATE_SIGNER`; `SIGNED_IMAGE_NOT_READINESS_PIN`; `SIGNED_PBOS_APPROVAL_PUBLIC_KEY_FILE_PATH`; `SIGNED_PBOS_OBSERVATION_KEY_FILE_PATH`; `SIGNED_PBOS_PROVIDER_PUBLIC_KEY_FILE_PATH`; `SIGNED_PRIVATE_SIGNER_PATH`; `SIGNED_SOURCE_PIN`; `SIGNED_STATE_RW_POLICY`. It also reported `INCIDENT_EXECUTION_IMAGE_DIFFERS_FROM_CURRENT_JOB` for older `s7mkp`. This is **the first direct inspected proof** of several pre-admission divergences.
3. **The newer `5dhzb` boundary error is operator-reported, not independently reconstructed.** Report: signed controller generation 23, exit code 2, `MB03_FILE_BOUNDARY:operator-public-key:exposed-permissions`; no worker run or mission PR. The error is consistent with a mounted Secret Manager public key readable by group/other; the repo verifier rejects any group/other access bit. It is also consistent with the signed job retaining a direct mount path, as the live audit found. This does **not** prove the full historical execution spec, active secret mode or approval image in the absence of the immutable execution JSON.
4. **Root-to-node protected secret handoff is already implemented as source**, in `containers/mb03-controller/stage-secrets.sh`: copies `/var/run/secrets/mb03/operator/public.pem` to `/var/lib/pbos-private/operator-public.pem` mode `0400`, then executes the controller as `node`. Offline synthetic smoke tests verify `0444 → 0400`, symlink rejection, and other failure cases. **Source code existing is not proof the signed runtime loaded that wrapper.**
5. **The registered review-only signed mission manifest is not a deployed release.** Replacing a job based on an unapproved placeholder full image digest is prohibited. Select an approved full digest and explicit manifest only under a separate protected release decision; verify job generation and command readback before any future signature.
6. **Cloud Run executed image, job current image, and approved image must be treated as three different pieces of evidence.** Current-versus-historical image mismatch does not, by itself, establish which was approved. Never substitute the historical `s7mkp` or `5dhzb` image in a new approval.

## What the protected forensic workflow will independently inspect

The pending read-only workflow on the audit PR reads the **current** signed job and historical `5dhzb` execution using `gcloud run jobs describe` and `gcloud run jobs executions describe`. It reports only allowed finding codes and SHA-256 image identities, not environment secrets. It checks the container command, args, four private key file paths, secret mounts, duplicate private signing-key env exposure, job generation and reconciliation status, and historical-vs-current image mismatch. It makes **no Cloud Run execute, replace, deploy, or secret read** call.

**Remaining after this read-only inspection:** historical actual filesystem `stat` mode at run time cannot be recovered from the immutable job specification alone unless an independently retained log records it. The current execution may still require separately approved **signature-free** signed-mode preflight capable of attesting private staged file permissions without mission business logic or provider signing credentials. This is a distinct, protected release gate, and cannot be substituted with more signatures.

## Current verdict

`SIGNED_MISSION_READY = BLOCKED` · `MB03_MISSION_001/002 = 0/2` · `CLOUD_RUN_NONMISSION_DIAGNOSTICS = 1/10 USED` · `9/10 REMAIN`.

**No new signature or signed mission retries are authorized by this report.**