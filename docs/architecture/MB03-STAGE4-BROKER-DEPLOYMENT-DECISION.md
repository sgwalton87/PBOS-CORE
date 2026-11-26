# MB-03 Stage 4 — broker deployment decision package (review required)

**Status:** proposed, NOT deployed, NOT approval to execute an MB-03 mission.

Scope: `pbos-genesis-staging`, numeric project `211508256780`, region `us-west1`. Existing broker HTTP implementation was merged as PR #155. This package adds HTTP negative/lease tests and records the minimum **separately reviewed** deployment bindings.

## Existing read-only inventory

- Existing `the-playbook` Vercel project has verified production domain `app.playbookseriesinc.org`. **Do not redirect, replace, or attach it to the broker.**
- Earlier project-scoped `pbos-mb03-canary` Vercel Sandbox credential and GCP secret are already prepared; no new token is requested.
- Controller and worker images are already published; no replacement is part of this broker deployment.
- Secrets previously provisioned (verify actual resource-level IAM before use):
  - Upstream `mb03-model-upstream-api-key:1`: broker service account **only**.
  - Admin `mb03-model-broker-admin-credential:1`: controller service account **only** at present.
  - The **broker must additionally receive Secret Accessor on the single admin secret** to verify incoming bearer tokens; this scoped IAM change requires independent review. Never grant upstream API access to the controller.
- Broker service account: `pbos-mb03-model-broker@pbos-genesis-staging.iam.gserviceaccount.com`.

## Two origins without new application DNS: proposal, not effective configuration

Google Cloud Run documents deterministic service and traffic-tag URLs:

- **Proposed admin origin**: `https://pbos-mb03-model-broker-211508256780.us-west1.run.app`
- **Proposed model origin**: `https://model---pbos-mb03-model-broker-211508256780.us-west1.run.app`

Both must route to the **same Cloud Run service AND the same immutable revision**. The model origin is a traffic-tag URL, not a second broker service. Neither URL should be treated as live or authorized until Cloud Run read-back validates DNS, TLS, routing, traffic tags, and the expected `Host` header.

Choose a staging service named `pbos-mb03-model-broker` only after checking that name isn't already in use; do not overwrite unrelated resources. Set the service max instances to **1** and revision max instances to **1**; verify that the resulting topology actually serves both origins from the same process. If two instances or revisions could serve requests concurrently, **BLOCK**: the current broker keeps leases in memory and cannot preserve cross-instance revocation.

Both endpoints use HTTPS at the Google frontend. The admin path additionally requires the broker admin bearer token. The model path accepts **only the short-lived bounded lease token**, and upstream OpenAI credential never leaves the broker.

**Important**: For Vercel Sandbox workers to call model ingress, authentication and ingress settings must be separately reviewed. Disabling Cloud Run Invoker IAM is a significant change requiring explicit approval, even though the application has bearer-token authentication; don't silently enable public ingress.

## Exact proposed model

**Candidate only, not approved:** `gpt-5.4-mini-2026-03-17`, listed in official OpenAI API docs as a Responses-capable coding model. Model availability for the user's specific API project, operational permissions, and price controls are **not independently verified**. Obtain explicit review for the exact identifier before setting `PBOS_WORKER_MODEL` or allowing an upstream request. No paid model call is authorized by this engineering PR.

## Deployment configuration and proof

The current code's protected secret-file contract expects:
- `PBOS_MODEL_BROKER_ADMIN_FILE` -> a regular private file mounted from `mb03-model-broker-admin-credential:1` at a reviewed `/var/run/...` path.
- `PBOS_MODEL_UPSTREAM_KEY_FILE` -> a regular private file mounted from `mb03-model-upstream-api-key:1`, and unreadable by the controller.
- `PBOS_MODEL_ADMIN_ORIGIN` and `PBOS_MODEL_ORIGIN` -> the exact independent HTTPS origins after verification.
- `PBOS_WORKER_MODEL` -> reviewed exact model.

Images must be built from the adopted commit and pinned by digest. Restrict environment approval to the exact source commit, image digest, service identity, two origins, model, IAM changes, and rollback.

Proof before certifying:
1. CI/typecheck/focused broker tests succeed on exact PR head; independently review negative HTTP host/path tests.
2. Verify bucket/Genesis/observer/mission configs unchanged.
3. Verify no model request is issued by deployment/health probes.
4. Under **separate protected staging deployment authorization**, build/publish reviewed broker image and deploy only the dedicated broker service.
5. Read back exact Cloud Run service/revision, identity, network/TLS, max-instance count and both origin routes.
6. Verify exact secret version references and effective IAM including inherited grants.
7. Synthetic lease issue/revoke/expiry/unauthorized 403 tests, with fake upstream or no billed API request.
8. Controller `--verify-bindings` requires its own safe non-mission entrypoint/authorization; current protected controller mainline requires mission authority and is not automatically a safe readiness command.
9. Record evidence, exact hash IDs and rollback in PBOS issue #95 and PBOS-RCC-001.

**Rollback:** remove only newly created model traffic tag/revision/service and resource-level broker secret access as explicitly approved. Preserve upstream key, canonical Genesis, read-only observer, published controller/worker images and Stage 1–3 evidence.

Mission execution remains **0/2**.
