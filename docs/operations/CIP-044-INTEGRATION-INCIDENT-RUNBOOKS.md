# CIP-044 Integration Incident Runbooks

## Authentication failure

Confirm connector, organization, key status, timestamp window, nonce, and signature evidence. Never log the secret. Revoke compromised credentials and require approved rotation.

## Dependency outage

Inspect latency, failure, retry, circuit, pending, and dead-letter metrics. Do not bypass an open circuit. Restore the dependency, allow a controlled probe, and replay only with approval.

## Data-exchange denial

Verify identity, authority action, purpose, classification, exchange approval, and communication rule. Denial is expected fail-closed behavior until all evidence is valid.

## Compromised connector

Declare an incident, suspend or revoke the connector, preserve audit and trace evidence, rotate credentials, inspect cross-tenant access attempts, and require certification before reactivation.

## Telemetry retention and export

Export structured logs, metrics, spans, alerts, integration events, delivery state, and approvals using correlation and connector IDs. Apply the system data-retention classification. Secrets and classified payload bodies must remain redacted.
