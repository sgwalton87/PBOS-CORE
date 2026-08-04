# CIP-047 Cloud Run Staging Deployment

## Status

IMPLEMENTED AND HUMAN-VALIDATED — DEPLOYMENT APPROVAL REQUIRED

## Deployment boundary

- Project: `pbos-genesis-staging`
- Region: `us-west1`
- Service: `pbos-v1-integration-staging`
- Artifact repository: `pbos-staging`
- Runtime identity: `pbos-integration-staging@pbos-genesis-staging.iam.gserviceaccount.com`
- Public health route: `GET /healthz`
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
