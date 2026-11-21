mock_provider "google" {}

variables {
  project_id = "pbos-production-fixture"
  region     = "us-west1"
}

run "foundation_has_no_cloud_run_service_or_secret_payload" {
  command = plan

  assert {
    condition     = length(google_cloud_run_v2_service.runtime) == 0
    error_message = "A runtime must require explicit release inputs."
  }

  assert {
    condition = (
      google_secret_manager_secret.connector_trust.secret_id == "pbos-connector-trust-bundle-production" &&
      google_secret_manager_secret.playbook_bootstrap.secret_id == "playbook-connector-bootstrap-production" &&
      google_secret_manager_secret_iam_member.runtime_trust.secret_id == "pbos-connector-trust-bundle-production"
    )
    error_message = "Runtime trust and the app handoff must use separate production secrets. The runtime may read only its trust bundle."
  }
}

run "runtime_is_private_pinned_and_single_writer" {
  command = plan

  variables {
    runtime = {
      image_digest         = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      trust_bundle_version = "2"
      network              = "pbos-prod"
      subnet               = "pbos-prod-run"
      state_server         = "10.1.2.3"
      state_export         = "/pbos_prod"
    }
  }

  assert {
    condition = (
      google_cloud_run_v2_service.runtime[0].ingress == "INGRESS_TRAFFIC_INTERNAL_ONLY" &&
      google_cloud_run_v2_service.runtime[0].deletion_protection &&
      google_cloud_run_v2_service.runtime[0].scaling[0].max_instance_count == 1 &&
      google_cloud_run_v2_service.runtime[0].template[0].max_instance_request_concurrency == 1 &&
      google_cloud_run_v2_service.runtime[0].template[0].volumes[0].nfs[0].read_only == false &&
      google_cloud_run_v2_service.runtime[0].template[0].containers[0].image == "us-west1-docker.pkg.dev/pbos-production-fixture/pbos-production/integration@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    )
    error_message = "The service must be private with pinned image, durable state and a single-writer ceiling."
  }
}

run "staging_project_is_rejected" {
  command = plan

  variables {
    project_id = "pbos-genesis-staging"
  }

  expect_failures = [var.project_id]
}

run "playbook_federation_uses_production_claims_and_id_token_only" {
  command = plan

  variables {
    enable_playbook_federation = true
  }

  assert {
    condition = (
      google_iam_workload_identity_pool_provider.vercel[0].oidc[0].issuer_uri == "https://oidc.vercel.com/pbos-genesis" &&
      strcontains(google_iam_workload_identity_pool_provider.vercel[0].attribute_condition, "assertion.environment == 'production'") &&
      strcontains(google_iam_workload_identity_pool_provider.vercel[0].attribute_condition, "prj_mZ74XbviZKKplwVYPU3FLhFNka73") &&
      google_service_account_iam_member.playbook_federation[0].role == "roles/iam.serviceAccountOpenIdTokenCreator" &&
      length(google_cloud_run_v2_service_iam_member.playbook_invocation) == 0
    )
    error_message = "Only the exact production Vercel project may mint ID tokens, and no invoker grant exists without the runtime."
  }
}
