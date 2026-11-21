# Protected VCR publication

The publishing workflow builds the reviewed Linux AMD64 image on GitHub-hosted runners. Its image source is PR #100 at `4e5c45a8dd6d0e5ce58ee5bb975ddfdcb3efdb0e`. The runtime canary stays pinned to `121ce910d47ef65e76416d666220204ef17496e9`. It publishes only to `vcr.vercel.com/pbos-genesis/pbos-mb03-canary/canary`.

## Administrator setup

1. In [GitHub environments](https://github.com/sgwalton87/PBOS-CORE/settings/environments), create `mb032-vcr-publish`. Add at least one designated independent required reviewer, enable **Prevent self-review**, disable administrator bypass, and allow only the branch `main`. The job checks the required-reviewer settings and the run’s recorded approval before requesting registry credentials. An absent or unprotected environment causes a failure before registry login.
2. In the dedicated Vercel project’s **Settings → Build and Deployment → OIDC Policies**, create a **Vercel Container Registry** policy for **Read and write**. Scope it to project `pbos-mb03-canary` (`prj_1zGe3VEqWFxaBgxRfKYPI9hafyg9`) in team `pbos-genesis` (`team_uEIqx3HHy04a9D2ePf3NwRdl`). Keep the project Git-disconnected. Configure exact-match claims.

   | Claim | Value |
   | --- | --- |
   | Issuer | `https://token.actions.githubusercontent.com` |
   | `aud` | `https://vercel.com/pbos-genesis/mb032-vcr-publish` |
   | `repository` | `sgwalton87/PBOS-CORE` |
   | `repository_id` | `1321290119` |
   | `sub` | `repo:sgwalton87/PBOS-CORE:environment:mb032-vcr-publish` |
   | `ref` | `refs/heads/main` |
   | `event_name` | `workflow_dispatch` |
   | `workflow_ref` | `sgwalton87/PBOS-CORE/.github/workflows/pbos-mb032-vcr-publish.yml@refs/heads/main` |

   If the policy interface cannot apply the project scope and required claims, leave publication disabled. See [VCR GitHub Actions](https://vercel.com/docs/container-registry/github-actions) and [OIDC policy matching](https://vercel.com/docs/oidc/policies).

3. Add these **environment variables** to `mb032-vcr-publish`. They are identifiers and should be set on this environment only. Registry authentication uses a short-lived OIDC exchange.

   | Variable | Value |
   | --- | --- |
   | `PBOS_VCR_TEAM_ID` | `team_uEIqx3HHy04a9D2ePf3NwRdl` |
   | `PBOS_VCR_PROJECT_ID` | `prj_1zGe3VEqWFxaBgxRfKYPI9hafyg9` |
   | `PBOS_VCR_OIDC_POLICY_ID` | The VCR policy ID returned by Vercel |

## Review and dispatch

GitHub requires the manual workflow to be present on the default branch. The stacked draft permits review and offline CI while that requirement remains open. Default-branch adoption requires a separate authorized review. Keep the current drafts unmerged during this engineering task.

When the workflow is available on `main`, a manual dispatch with `publish=false` builds and runs the offline checks without packaging an image for transfer or requesting OIDC. For an independently authorized publish, dispatch on `main` with `image_source_sha=4e5c45a8dd6d0e5ce58ee5bb975ddfdcb3efdb0e` and `publish=true`. The operator’s explicit publication authorization and a distinct environment reviewer are both required. An authorized retry uses a fresh dispatch and review.

Validation builds the exact checked-out source, runs the network-disabled bootstrap and collector smoke test, verifies the Codex binary, and seals the Docker archive. The protected job reloads the exact archive and checks its hash and architecture before logging into VCR. It pushes a run-specific tag, reads the registry manifest, pulls by immutable digest, and verifies the pulled platform and binary. The GitHub job summary and `mb032-verified-vcr-image` artifact then carry the immutable URI and provenance. The pinned login action logs out and revokes its Vercel credential after the job.

An independent reviewer can download the evidence and record the verified URI and CI run in [issue #95](https://github.com/sgwalton87/PBOS-CORE/issues/95). The workflow has read-only GitHub permissions and no issue-write access.

Use the verified URI as `PBOS_VERCEL_CANARY_IMAGE` after VCR reports the image ready for Sandbox use. The team ID, project ID and packaged binary SHA-256 are in the evidence and [image readiness procedure](README.md). Supply the dedicated `PBOS_VERCEL_SANDBOX_TOKEN` from the controller's protected secret store. It is separate from the VCR publishing credential. The billable Sandbox VM probe and the exact mission signature have separate approval gates.
