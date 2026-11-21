terraform {
  required_version = ">= 1.11, < 2.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  description = "Independently approved, dedicated production PBOS Google Cloud project."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id)) && !strcontains(var.project_id, "stag") && var.project_id != "playbook-platform-500403"
    error_message = "Use a dedicated production project, distinct from the known staging and Playbook application projects."
  }
}

variable "region" {
  type        = string
  description = "Approved region shared by Cloud Run, Artifact Registry and the private durable state export."
}

variable "runtime" {
  description = "Reviewed release inputs. Keep null to prepare foundation resources only. The NFS export and subnet must already be approved and provisioned."
  type = object({
    image_digest         = string
    trust_bundle_version = string
    network              = string
    subnet               = string
    state_server         = string
    state_export         = string
  })
  default = null

  validation {
    condition = var.runtime == null ? true : (
      can(regex("^sha256:[0-9a-f]{64}$", var.runtime.image_digest)) &&
      can(regex("^[1-9][0-9]*$", var.runtime.trust_bundle_version)) &&
      can(cidrnetmask("${var.runtime.state_server}/32")) &&
      !strcontains(var.runtime.state_server, "/") &&
      can(regex("^/[a-zA-Z0-9_-]+$", var.runtime.state_export))
    )
    error_message = "Pin an immutable image digest, numbered secret version, IPv4 state server and absolute dedicated export."
  }
}

resource "google_service_account" "runtime" {
  account_id   = "pbos-prod-runtime"
  display_name = "PBOS production Cloud Run runtime"
}

resource "google_service_account" "release" {
  account_id   = "pbos-prod-release"
  display_name = "PBOS production release identity"
}

resource "google_artifact_registry_repository" "runtime" {
  location      = var.region
  repository_id = "pbos-production"
  description   = "Reviewed PBOS production runtime images"
  format        = "DOCKER"

  docker_config {
    immutable_tags = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret" "connector_trust" {
  secret_id = "pbos-connector-trust-bundle-production"

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret" "playbook_bootstrap" {
  secret_id = "playbook-connector-bootstrap-production"

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_trust" {
  secret_id = google_secret_manager_secret.connector_trust.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_service" "runtime" {
  count               = var.runtime == null ? 0 : 1
  name                = "pbos-v1-integration-production"
  location            = var.region
  deletion_protection = true

  # Initial qualification stays internal and keeps the invoker IAM check enabled.
  ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  scaling {
    max_instance_count = 1
  }

  template {
    service_account                  = google_service_account.runtime.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    max_instance_request_concurrency = 1
    timeout                          = "30s"

    scaling {
      max_instance_count = 1
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = var.runtime.network
        subnetwork = var.runtime.subnet
      }
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.runtime.repository_id}/integration@${var.runtime.image_digest}"

      ports {
        container_port = 8080
      }

      env {
        name  = "PBOS_ENVIRONMENT"
        value = "production"
      }
      env {
        name  = "PBOS_ORGANIZATION_ID"
        value = "PLAYBOOK-ORG-001"
      }
      env {
        name  = "PBOS_INTEGRATION_STATE_PATH"
        value = "/mnt/pbos-state/integration-state.json"
      }
      env {
        name = "PBOS_CONNECTOR_TRUST_BUNDLE"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.connector_trust.secret_id
            version = var.runtime.trust_bundle_version
          }
        }
      }

      startup_probe {
        initial_delay_seconds = 1
        timeout_seconds       = 2
        period_seconds        = 5
        failure_threshold     = 6
        http_get {
          path = "/health"
          port = 8080
        }
      }

      volume_mounts {
        name       = "integration-state"
        mount_path = "/mnt/pbos-state"
      }
    }

    volumes {
      name = "integration-state"
      nfs {
        server    = var.runtime.state_server
        path      = var.runtime.state_export
        read_only = false
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime_trust]

  lifecycle {
    prevent_destroy = true
    precondition {
      condition = (
        can(regex("^10\\.|^172\\.(1[6-9]|2[0-9]|3[01])\\.|^192\\.168\\.", var.runtime.state_server)) &&
        !strcontains(lower(var.runtime.network), "staging") &&
        !strcontains(lower(var.runtime.subnet), "staging")
      )
      error_message = "Use an approved private IPv4 export and production network and subnet."
    }
  }
}
