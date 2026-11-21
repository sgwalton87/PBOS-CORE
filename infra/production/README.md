# PBOS-PROD-001 production runtime

This module prepares the production deployment of the existing PBOS v1 Cloud Run integration service. The default plan has no Cloud Run service. The module defines separate production release and runtime identities, an immutable image registry, and separate Secret Manager containers for the runtime trust bundle and the app handoff. Only the runtime trust secret grants the runtime identity access. It does not create secret versions, assign the release identity, grant invokers, or publish images. Use an approved production project, protected Terraform backend, and applicable Cloud Run, Compute, Artifact Registry and Secret Manager APIs.

## Staging evidence and production differences

On November 21, 2026, read-only inventory found `pbos-v1-integration-staging` ready at revision `pbos-v1-integration-staging-rotate134124` in `pbos-genesis-staging/us-west1`. Its trust and bootstrap secrets were staging resources with enabled versions. The Playbook application project returned no Cloud Run service or PBOS Secret Manager resources. No production service or production authority was established by that inventory. The application has seven PBOS settings on Vercel Preview only.

Keep production integration state on a dedicated private NFS export, mounted at `/mnt/pbos-state` in a production subnet. This retains PBOS's file repository and its existing exclusive-create lock and rename writes. Google documents that Cloud Storage FUSE does not provide multi-writer locking. Cloud Run also mounts NFS with advisory locking disabled. Confirm exclusive-create behavior, rename, restart persistence and restored bytes on a disposable export before production data is admitted. Provision backup and restore ownership for the production share separately. Keep service-wide and revision scaling at one and serialize changes. During a release or rollback, keep old and candidate writers from overlapping on the export. The existing file repository is a single-writer system.

The initial service has internal ingress and retains Google invoker IAM. The application uses Vercel OIDC, Google STS and an audience-bound Google ID token when deployed to Vercel Production. Optional Terraform federation binds the issuer, audience, immutable team/project IDs and production subject, and grants one service account only Cloud Run invocation. A private route is still required. Direct internet access and IP allowlisting alone do not satisfy the private ingress requirement. An IAM-approved request must still satisfy PBOS connector HMAC and constitutionally scoped approvals. The module provisions neither a public invoker binding nor a standing credential.

## Validate without Google Cloud access

With Terraform initialized locally without a backend, run the mocked plan tests and schema validation.

```sh
terraform -chdir=infra/production fmt -check
terraform -chdir=infra/production init -backend=false -lockfile=readonly
terraform -chdir=infra/production validate
terraform -chdir=infra/production test
```

The mocked tests check that runtime creation is opt-in, staging project IDs fail, and the qualified service is private, immutable and bounded. They do not establish cloud storage semantics, IAM reachability or production runtime authority.

## Protected qualification sequence

1. Approve the production project, billing, API enablement, state backend, network and dedicated NFS export. Verify the container user can access the export and approve isolated storage qualification, backup and recovery. Never attach staging or original Genesis state.
2. Independently review the plan and explicitly authorize applying the foundation, release identity IAM, build and Artifact Registry publication. Create no user-managed service-account keys. Use an approved short-lived identity for release.
3. Have the PBOS credential authority issue a new production credential for the certified Playbook connector. Review the trust bundle's exact connector, organization, allowed operations and expiry before activating its independently authorized Secret Manager version. Keep the same key ID and secret bytes paired across PBOS and the approved app secret handoff. Never use a staging bootstrap or put secret values in Terraform.
4. Give the production runtime an independently reviewed `productionApprovals` array in the production trust bundle. Each record has `approvalId`, `organizationId`, `connectorId`, `registrationId`, `role`, `operation`, `approvedBy`, `status`, `issuedAt`, and `expiresAt`. Exchange records additionally require a classification. A record may narrow its role-wide grant to an exact `actorId`. PBOS binds Playbook actor and mapping IDs to the external identity in either case. PBOS verifies exact scope and time, refuses revoked or unknown references, and enforces approval before reading any cached result. Playbook sends the matching role-specific identity reference, and the exchange uses its independently issued reference. The credential issuer and approval custodian must approve and verify source decisions before projecting them into the numbered trust secret. Connector credentials and app code have no approval-write path. After revocation, take the old serving revision out of service before resuming traffic with the updated bundle. The runtime does not poll for changes to a numbered secret. Never use a staging approval or import operator signing keys into Cloud Run.
5. After separate authorization, deploy the reviewed digest to the internal service with the approved numbered trust-bundle version and private state export. Obtain Cloud Run **v2** service metadata through a read-only identity and collect a fresh, short-lived, audience-bound Cloud Run invoker token via the approved identity path. From an allowed internal network, provide that token to the verifier process as `PBOS_CLOUD_RUN_ID_TOKEN`.

```sh
node --import tsx pbos/tools/verify-production-integration.ts \
  /protected/cloud-run-v2-service.json APPROVED_PROJECT APPROVED_REGION sha256:REVIEWED_DIGEST
```

The verifier checks the private ingress, service/revision and digest, runtime identity, dedicated trust reference, state mount, sole ready revision and traffic, typed health response, and PBOS's own HMAC denial for an unsigned read. Also review effective IAM, network access and the actual state export separately. Keep logs to sanitized verification results. The production health gate is separate from an authorized signed Scholar verification and release.

6. When disposable Scholar acceptance proves approved identity, lifecycle receipt and private projection, obtain explicit authorization for the production application connection and release. Add the five server runtime/connector values and the two production approval references to the approved app environment. Confirm all 15 role pathways on disposable data. Keep the existing immutable image, numbered trust secret version and state backup evidence available for a separately approved rollback.

Sources: [Cloud Run NFS mount semantics](https://docs.cloud.google.com/run/docs/configuring/services/nfs-volume-mounts), [Cloud Storage FUSE limitations](https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts), and [CIP-047 staging evidence](../../docs/operations/CIP-047-CLOUD-RUN-STAGING.md).


## PBOS-PROD-002 qualification handoff

- **Authority owner:** PBOS governance. Export approved, role/operation-scoped identity and exchange records for Scholar, Scholar-Athlete and Transition Youth. Set `PBOS_ENVIRONMENT=production` on the runtime. App production connector values must come from CIP-045 credential issuance and the production bootstrap secret. The source matrix is in Playbook #321. Production identity registrations and exchanges without a matching grant fail closed. Other PBOS journeys must have independently reviewed grants and send their applicable scope before their PBOS operations are enabled.
- **Network owner:** Vercel and Google Cloud administrators. Confirm Secure Compute private VPN routing to the Google VPC and private Google API/Cloud Run access with DNS preserving the exact approved `run.app` origin. Google Cloud lists Cloud VPN sources as internal. No private path or plan entitlement has been verified here. Select the approved VPC/subnet, route and DNS first. Do not enable public ingress or public invoker IAM. Verify Vercel's team issuer mode, then authorize applying the production-only WIF bindings. Store the nonsecret `PBOS_GCP_WIF_PROVIDER`, `PBOS_GCP_INVOKER_SERVICE_ACCOUNT`, and `PBOS_CLOUD_RUN_AUDIENCE` on Vercel Production after review. `PBOS_API_URL` must use the same approved origin and `/pbos/v1`. Probe production identity versus preview identity, IAM denial, and HMAC denial in the approved isolated environment before serving application users.
- **State owner:** Google Cloud storage administrator. On a separate empty NFS export named `pbos-disposable-qualification`, create the `.pbos-disposable-qualification` marker only after qualification authorization. Run `node --import tsx pbos/tools/qualify-integration-state-export.ts /approved/path/pbos-disposable-qualification` from the runtime filesystem. It uses synthetic mappings and checks exclusive create in a different process, rename, persisted reload, backup bytes and restore. Local POSIX results cannot establish NFS semantics across instances. Run the same isolated evidence checks across separate clients and an approved revision replacement. Test controller crash and lock reconciliation and prove rollback from a reviewed backup before admitting any production state.

See [Vercel GCP identity federation](https://vercel.com/docs/oidc/gcp), [Google Cloud Run internal ingress](https://docs.cloud.google.com/run/docs/securing/ingress), and [private Vercel connectivity](https://vercel.com/kb/guide/hosting-backend-apis).
