# CIP-047 Cloud Run Staging Deployment

## Status

STAGING DEPLOYED — SIGNED PLAYBOOK ACTIVATION PENDING

## Deployment boundary

- Project: `pbos-genesis-staging`
- Region: `us-west1`
- Service: `pbos-v1-integration-staging`
- Artifact repository: `pbos-staging`
- Runtime identity: `pbos-integration-staging@pbos-genesis-staging.iam.gserviceaccount.com`
- Public health route: `GET /health`
- Authenticated connector route: `POST /pbos/v1`
- Minimum instances: `0`
- Maximum instances: `1` while the file-backed staging state repository is mounted

The container fails closed unless the organization, durable state path, and connector trust bundle are configured. Connector requests remain HMAC-authenticated. Governance approval identifiers and allowed runtime actions are explicit allowlists in the Secret Manager trust bundle.

## Human validation gate

Operator-reported result: **PASS**, 2026-08-04.

- `npm run typecheck` — green
- `npm run test:run` — green
- `npm run build` — green

Cloud Build YAML parsing remediation validated green by the human operator on 2026-08-04; corrected image definition awaits merge and resubmission.

First staging revision evidence: the bucket mounted and Secret Manager configuration was accepted, but the source-executed TypeScript entrypoint was absent from the runtime image. The reproducible container now compiles the Cloud Run dependency graph in a build stage and copies the emitted artifact into a minimal runtime stage. The remediation passed typecheck, tests, build, and emitted-entrypoint verification by the human operator on 2026-08-04; a new immutable image is required before redeployment.

The corrected compiled revision became healthy and its public `/pbos/v1` boundary rejected anonymous traffic with `401`. Google Cloud Run intercepted `/healthz` before the container because the platform reserves some paths ending in `z`. PBOS now uses the portable `/health` route; the remediation passed typecheck, tests, and build by the human operator on 2026-08-04 and was promoted as a new immutable image.

Deployed revision `pbos-v1-integration-staging-2d8fb8d` serves image digest `sha256:a8e08389e28c9b0c335e2ce547acf795f884ec9aaf9398998d6a2563c1ffbc43`. Operator evidence confirms `GET /health` returns `200`, anonymous `POST /pbos/v1` returns `401`, container concurrency is `1`, and the active revision maximum scale is `1`. Public Cloud Run invocation was explicitly approved because PBOS HMAC authentication remains mandatory on the connector API.

The signed Playbook activation command and staging runtime handlers passed typecheck, tests, and build by the human operator on 2026-08-04. Live credential use and the approved private Scholar data exchange remain protected execution gates.

The protected signed activation completed successfully on revision `pbos-v1-integration-staging-adae599` with exit code `0`. PBOS registered and certified the Playbook connector, activated the Scholar domain, mapped the synthetic staging identity, discovered capabilities, reported governed health, accepted the approved onboarding event and private dashboard exchange, and returned three durable provenance-bearing audit events. The temporary credential file was removed immediately after execution.

Cross-revision recovery completed successfully on `pbos-v1-integration-staging-recovery1`, which served 100% of traffic using the same immutable runtime digest. The read-only verifier recovered the active certified connector, active Scholar domain, and all three original audit events with exit code `0`; it did not replay registration, certification, activation, identity, lifecycle, or data-exchange mutations.

Run locally and stop if any command fails:

```bash
npm run typecheck
npm run test:run
npm run build
```

## Protected preparation

Deployment requires explicit operator approval before creating the state bucket, secret, IAM bindings, image, or Cloud Run revision.

The Secret Manager value named `pbos-connector-trust-bundle-staging` must follow this shape:

```json
{
  "credentials": [
    {
      "credentialId": "...",
      "organizationId": "PLAYBOOK-ORG-001",
      "connectorId": "PLAYBOOK-CONNECTOR-001",
      "keyId": "...",
      "scopes": ["..."],
      "status": "ACTIVE",
      "issuedBy": "PBOS-CREDENTIAL-AUTHORITY",
      "approvalId": "...",
      "issuedAt": "...",
      "expiresAt": "...",
      "secretBase64": "..."
    }
  ],
  "certificationApprovalIds": [],
  "domainApprovalIds": [],
  "lifecycleApprovalIds": [],
  "allowedRuntimeActions": ["READ_RUNTIME_HEALTH"]
}
```

Never commit the populated bundle, print it in CI output, or place it in a command-line argument. Create or update the secret from a protected local file and delete that file securely after the secret version is confirmed.

## Controlled build

After validation and approval, submit the immutable image:

```bash
IMAGE="us-west1-docker.pkg.dev/pbos-genesis-staging/pbos-staging/pbos-v1-integration:cip-047"
gcloud builds submit --config cloudbuild.yaml --substitutions="_IMAGE=${IMAGE}" .
```

Deployment, IAM grants, state-bucket creation, secret creation, and public/private ingress selection remain separate protected actions. The first staging deployment must not be promoted or treated as certified until health, authentication denial, signed connector traffic, restart recovery, backup/restore, rollback, rotation, and concurrent Playbook/Bulletproof evidence are collected.
