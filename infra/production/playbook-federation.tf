variable "enable_playbook_federation" {
  type        = bool
  default     = false
  description = "Enable after independent approval of the exact Production Vercel identity and private route."
}

resource "google_service_account" "playbook_invoker" {
  count        = var.enable_playbook_federation ? 1 : 0
  account_id   = "pbos-playbook-invoker"
  display_name = "Playbook production PBOS invocation only"
}

resource "google_iam_workload_identity_pool" "playbook" {
  count                     = var.enable_playbook_federation ? 1 : 0
  workload_identity_pool_id = "pbos-playbook-production"
  display_name              = "PBOS Playbook production"
}

locals {
  playbook_subject = "owner:pbos-genesis:project:the-playbook:environment:production"
}

resource "google_iam_workload_identity_pool_provider" "vercel" {
  count                              = var.enable_playbook_federation ? 1 : 0
  workload_identity_pool_id          = google_iam_workload_identity_pool.playbook[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "vercel"
  attribute_mapping                  = { "google.subject" = "assertion.sub" }
  attribute_condition                = "assertion.sub == '${local.playbook_subject}' && assertion.owner_id == 'team_uEIqx3HHy04a9D2ePf3NwRdl' && assertion.project_id == 'prj_mZ74XbviZKKplwVYPU3FLhFNka73' && assertion.environment == 'production'"

  oidc {
    issuer_uri        = "https://oidc.vercel.com/pbos-genesis"
    allowed_audiences = ["https://vercel.com/pbos-genesis"]
  }
}

resource "google_service_account_iam_member" "playbook_federation" {
  count              = var.enable_playbook_federation ? 1 : 0
  service_account_id = google_service_account.playbook_invoker[0].name
  role               = "roles/iam.serviceAccountOpenIdTokenCreator"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.playbook[0].name}/subject/${local.playbook_subject}"
}

resource "google_cloud_run_v2_service_iam_member" "playbook_invocation" {
  count    = var.enable_playbook_federation && var.runtime != null ? 1 : 0
  name     = google_cloud_run_v2_service.runtime[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.playbook_invoker[0].email}"
}
