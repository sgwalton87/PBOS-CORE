# MB-03 Stage 4 — broker deployment decision package (review only)

**Status:** engineering proposal; **not deployed**, not a protected-deployment approval.

Source: merged PBOS-CORE broker HTTP entrypoint (PR #155) and related security tests (PR #156). Stages 1–3 remain closed. Mission execution stays 0/2.

## Deployment architecture

- Region/project: `us-west1` / `pbos-genesis-staging`.
- **One dedicated Cloud Run SERVICE** (not a Job): proposed name `pbos-mb03-model-broker`, using `Dockerfile.mb03-model-broker` after reviewed image build/digest.
- Runtime service account: existing `pbos-mb03-model-broker@pbos-genesis-staging.iam.gserviceaccount.com`.
- **Two distinct publicly verifiable HTTPS hostnames** using a Google-managed certificate and HTTPS Application Load Balancer with **one serverless NEG pointing to the SAME Cloud Run service**. Host/path dispatch is enforced by the HTTP adapter and the broker; do not create two broker services (leases are in-memory).
- **Candidate, NOT approved DNS:** `mb03-broker-admin.playbookseriesinc.org` and `mb03-broker-model.playbookseriesinc.org`. The parent apex appears in the Vercel project, but this does **not** establish DNS edit authority, subdomain availability, or routing. Check all three before any DNS change.
- LB URL-map configuration must explicitly allow both hostnames and route them to the identical backend, preserve the external Host header, and deny unreviewed hosts/paths. Disable default public run.app ingress if verified compatible with LB-only access.
- Cloud Run: one active instance maximum; zero/min-instance and restart semantics require validation. **Process loss invalidates leases**, as designed; no promise that in-memory token state persists or survives an instance replacement. No live mission in readiness testing.

## Secret isolation

- Broker runtime: read the exact enabled `mb03-model-upstream-api-key:1` and the separately approved broker-admin secret through a private file mount with correct Linux UID/modes.
- Controller: only `mb03-model-broker-admin-credential:1`, never the upstream OpenAI credential.
- **Do not assume the broker currently has permission to retrieve its own admin secret.** Verify scoped Secret Accessor permission on that exact secret before service deployment; request separate review for any change. Do not broaden access to the whole GCP project.
- No secret value, private key, bearer token, or lease token in logs, GitHub, CI artifacts or issue comments.

## Model selection

**Candidate** `gpt-5.3-codex` because the remote worker performs code-oriented tasks and this name is listed among OpenAI API Codex models. **Not yet operator/model-owner approved and not verified accessible to the MB-03 API project.** Final `PBOS_WORKER_MODEL` must be an exact allowed model with explicit independent approval and permission/price review. Do not issue a billable model call merely to infer authorization.

## Deployment gates

1. Review exact PBOS-CORE commit, successful synthetic HTTP tests, confirmed LB topology, expected cost, two DNS hostnames, scoped service accounts, immutable image and rollback.
2. Obtain the **single distinct protected staging infrastructure authorization** referencing the exact resource/diff. Code review alone is not that approval.
3. Deploy only after the approved values and hosts are confirmed. Read back Cloud Run ingress, SA, max instances, image digest, secret versions, LB URL maps, TLS and DNS; record actual evidence.
4. Run synthetic admin-host/model-host negative tests, lease issue/revoke without calling upstream OpenAI. Confirm upstream failures fail closed. Do not run either MB-03 mission.
5. Then integrate broker origins and admin-only credential with the protected controller under its separate reviewed deployment. `--verify-bindings` must pass before Stage 4 completion.
6. Rollback: disable relevant LB host forwarding, revoke only new broker-scoped credentials if compromise requires it, retain immutable evidence and existing observer/state.

## Known limitations of this review package

No Google Cloud direct cloud-management connector is available here, and the Vercel connection does not currently resolve the recorded canary project ID; therefore DNS, domain ownership, Cloud Run deployment, and model project entitlement have **not** been independently verified from this session. Do not label any of those complete.
