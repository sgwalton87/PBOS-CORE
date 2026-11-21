# PBOS-PROD-001 production runtime

This module prepares the production deployment of the existing PBOS v1 Cloud Run integration service. The default plan has no Cloud Run service. The module defines separate production release and runtime identities, an immutable image registry, and the runtime trust secret container. It does not create secret versions, assign the release identity, grant invokers, or publish images. Use an approved production project, protected Terraform backend, and applicable Cloud Run, Compute, Artifact Registry and Secret Manager APIs.

## Staging evidence and production differences

On November 21, 2026, read-only inventory found `pbos-v1-integration-staging` ready at revision `pbos-v1-integration-staging-rotate134124` in `pbos-genesis-staging/us-west1`. Its trust and bootstrap secrets were staging resources with enabled versions. The Playbook application project returned no Cloud Run service or PBOS Secret Manager resources. No production service or production authority was established by that inventory. The application has seven PBOS settings on Vercel Preview only.

Keep production integration state on a dedicated private NFS export, mounted at `/mnt/pbos-state` in a production subnet. This retains PBOS's file repository and its existing exclusive-create lock and rename writes. Google documents that Cloud Storage FUSE does not provide multi-writer locking. Cloud Run also mounts NFS with advisory locking disabled. Confirm exclusive-create behavior, rename, restart persistence and restored bytes on a disposable export before production data is admitted. Provision backup and restore ownership for the production share separately. Keep service-wide and revision scaling at one and serialize changes. During a release or rollback, keep old and candidate writers from overlapping on the export. The existing file repository is a single-writer system.

The initial service has internal ingress and retains Google invoker IAM. The application currently sends PBOS HMAC requests and has no Google IAM admission path across Vercel. Opening ingress or granting a service identity access is a separate reviewed decision. An IAM-approved request must still satisfy PBOS connector HMAC and constitutionally scoped approvals. The module provisions neither a public invoker binding nor a standing credential.

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
4. Resolve the approval-enforcement gate before exposing activation. The Scholar identity reference is presently checked by the app for presence and ownership but never transmitted to the PBOS identity-registration request. Core private exchange checks for a nonempty approval ID and classification rather than verifying the approval binding. Before enabling production traffic, governance must supply both active scoped approvals and approve a runtime enforcement path for those artifacts. The service must deny unknown, expired, revoked and wrong-scope references. A staging approval ID or an arbitrary string cannot satisfy this gate.
5. After separate authorization, deploy the reviewed digest to the internal service with the approved numbered trust-bundle version and private state export. Obtain Cloud Run **v2** service metadata through a read-only identity and collect a fresh, short-lived, audience-bound Cloud Run invoker token via the approved identity path. From an allowed internal network, provide that token to the verifier process as `PBOS_CLOUD_RUN_ID_TOKEN`.

```sh
node --import tsx pbos/tools/verify-production-integration.ts \
  /protected/cloud-run-v2-service.json APPROVED_PROJECT APPROVED_REGION sha256:REVIEWED_DIGEST
```

The verifier checks the private ingress, service/revision and digest, runtime identity, dedicated trust reference, state mount, sole ready revision and traffic, typed health response, and PBOS's own HMAC denial for an unsigned read. Also review effective IAM, network access and the actual state export separately. Keep logs to sanitized verification results. The production health gate is separate from an authorized signed Scholar verification and release.

6. When disposable Scholar acceptance proves approved identity, lifecycle receipt and private projection, obtain explicit authorization for the production application connection and release. Add the five server runtime/connector values and the two production approval references to the approved app environment. Confirm all 15 role pathways on disposable data. Keep the existing immutable image, numbered trust secret version and state backup evidence available for a separately approved rollback.

Sources: [Cloud Run NFS mount semantics](https://docs.cloud.google.com/run/docs/configuring/services/nfs-volume-mounts), [Cloud Storage FUSE limitations](https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts), and [CIP-047 staging evidence](../../docs/operations/CIP-047-CLOUD-RUN-STAGING.md).
