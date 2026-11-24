# MB-03 model lease broker — staging deployment review

This change is **engineering preparation**, not a deployed or authorized model service.

- Entrypoint: `pbos/tools/mb03-staging-model-broker-http.ts`
- Image: `Dockerfile.mb03-model-broker`
- Broker implementation: `pbos/master-builder/codex-model-lease-broker.ts` (unchanged)
- No mission dispatch, canonical state, or operator signing authority included.

## Required protected deployment conditions

1. Independently approve the exact branch/commit, network topology, IAM and rollback before deployment.
2. Bind **distinct, genuine HTTPS DNS origins** for the administration endpoint and the model ingress endpoint to the **same** Cloud Run broker service. Backend host forwarding must preserve the original reviewed hostname. Do not invent domains or reuse the same origin. Direct run.app URL is rejected by hostname routing.
3. Use **one active broker process** because lease/token state is in-memory. Explicitly set Cloud Run `max-instances=1`, concurrency and timeout controls. Scaling down revokes leases; no cross-instance session persistence is claimed.
4. Run as `pbos-mb03-model-broker@pbos-genesis-staging.iam.gserviceaccount.com`. Only this identity may access the **specific** `mb03-model-upstream-api-key:1` secret.
5. Mount that upstream key and the broker-admin secret as private 0400 regular files under `/var/run/`, using `PBOS_MODEL_UPSTREAM_KEY_FILE` and `PBOS_MODEL_BROKER_ADMIN_FILE`. The admin credential needs a reviewed secure handoff to the broker runtime; do **not** grant the controller upstream access. Controller retains access only to `mb03-model-broker-admin-credential:1`. Validate exact secret versions and least-privilege IAM before deployment.
6. Set `PBOS_MODEL_ADMIN_ORIGIN` and `PBOS_MODEL_ORIGIN` to the separately reviewed public hostnames; `PBOS_WORKER_MODEL` must be an explicitly approved model available to the staging API project. Do not assume ChatGPT subscription billing covers the API.
7. Do not expose the OpenAI key, broker admin key, or leased model tokens in logs, workflows, GitHub, Vercel, or test artifacts.

## Test and evidence requirements

- Review/test exact-host restrictions, admin authentication and cross-origin 403 responses.
- Validate issue/revoke, deadlines, expiry, 24-request quota, unsupported model/tools, and upstream failure without real mission dispatch.
- Validate lifecycle behavior: process exit invalidates leases (fail-closed), but no persistent lease state is promised.
- Verify controller admin origin is not identical to model ingress origin.
- After independently approved staging deployment, verify running service identity, immutable image, two HTTPS origins, secret references, and no upstream credential leakage.
- Run synthetic-only contract tests before any model API request; production or real MB-03 missions are **not** authorized.
- Record actual evidence and rollback procedure in issue #95 and PBOS-RCC-001.

## Outstanding work

This PR **does not** create DNS, a load balancer, Google Cloud Run resources, or the service-to-service secret handoff. Those require separately reviewed staging infrastructure implementation and protected deployment. The engineering artifact must pass current-head CI and independent code review before promotion.
