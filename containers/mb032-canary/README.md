# PBOS MB-03.2 canary image

This Linux AMD64 image supplies the tools expected by the Vercel Sandbox bootstrap in PR #99. It pins the Debian base by manifest digest, resolves OS packages from dated signed Debian snapshots, and verifies both the Codex release archive and the installed executable. The image build context contains no working tree, Genesis state, or account credentials.

Runtime trial source stays pinned at `121ce910d47ef65e76416d666220204ef17496e9`. The image review and runtime source are separate revisions. The image definition requires Codex `rust-v0.171.0`. The verified upstream Linux executable SHA-256 is `b76a027d6b210f9a8da7aaf321dd235c700f0ef7a794d4a5314b9af6c134f0f0`. Confirm it again inside the published image before setting the readiness configuration.

## Build and verify with no registry credentials

From the PBOS checkout, with an available Docker engine:

```sh
docker build --platform linux/amd64 --tag pbos-mb032-canary:local containers/mb032-canary
checks="$(mktemp -d)"
python3 containers/mb032-canary/extract-probes.py pbos/master-builder/vercel-remote-provider.ts "$checks"
cp containers/mb032-canary/smoke.sh "$checks/"
docker run --rm --network none --entrypoint /bin/sh \
  --mount "type=bind,src=$checks,dst=/checks,readonly" pbos-mb032-canary:local /checks/smoke.sh
```

The check reads the executable bytes without starting Codex. It exercises the actual bootstrap and collector using disposable Git files, including an unauthorized second edit. The GitHub workflow runs the same checks against the exact draft revision. GitHub validation is separate from Vercel resource readiness.

## Dedicated Vercel configuration

Use **PBOS Genesis** (`pbos-genesis`, `team_uEIqx3HHy04a9D2ePf3NwRdl`) and dedicated project **`pbos-mb03-canary`**. Leave Git deployment disconnected. Resolve the project ID with a team-scoped project lookup after an authorized account creates it. Vercel requires a Team Owner or Member for project creation, or a Developer with the **Create Project** extended permission.

After publishing is authorized:

1. Authenticate to VCR explicitly against the dedicated project with `vercel --scope pbos-genesis vcr login docker --project pbos-mb03-canary`.
2. Publish the reviewed AMD64 image to `vcr.vercel.com/pbos-genesis/pbos-mb03-canary/canary` and record the immutable manifest digest returned by VCR. Confirm VCR reports the image as ready for Sandbox use.
3. Pull the immutable reference and verify the binary without starting Codex.

   ```sh
   docker pull --platform linux/amd64 "$PBOS_VERCEL_CANARY_IMAGE"
   docker run --rm --platform linux/amd64 --network none --entrypoint /usr/bin/sha256sum \
     "$PBOS_VERCEL_CANARY_IMAGE" /usr/local/bin/codex
   ```

Provide these settings through the authorized controller's secret store and configuration. Keep the controller token out of files, shell history, logs, the repository, and the image.

| Setting | Expected value |
| --- | --- |
| `PBOS_VERCEL_SANDBOX_TOKEN` | Controller credential authorized to create and stop Sandbox VMs in the dedicated project |
| `PBOS_VERCEL_SANDBOX_TEAM_ID` | `team_uEIqx3HHy04a9D2ePf3NwRdl` |
| `PBOS_VERCEL_SANDBOX_PROJECT_ID` | Team-scoped lookup's confirmed `prj_…` for `pbos-mb03-canary` |
| `PBOS_VERCEL_CANARY_IMAGE` | `vcr.vercel.com/pbos-genesis/pbos-mb03-canary/canary@sha256:<published digest>` |
| `PBOS_VERCEL_CODEX_SHA256` | The independently confirmed hash of the packaged executable, matching the pinned binary above |

The readiness command creates a real VM. Keep it stopped until resource authorization is confirmed. No Codex dispatch or mission signature is part of this image-readiness procedure.
