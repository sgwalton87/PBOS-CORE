# PBOS v1 API

`PbosV1Api` provides the transport-neutral PBOS service boundary. Governance callbacks are mandatory constructor dependencies so an application cannot self-certify, activate a domain, or manufacture an authority decision.

`PbosNodeHttpAdapter` exposes the API at `POST /pbos/v1` without coupling the core service to an application framework. Deployment composition supplies certification, activation, and runtime authority providers.

## PBOS v1 operation matrix

Registration and governance:

- `REGISTER_SYSTEM`
- `CERTIFY_SYSTEM`
- `REGISTER_DOMAIN`
- `ACTIVATE_DOMAIN`
- `REGISTER_IDENTITY`

Connector and domain lifecycle:

- `GET_CONNECTOR_STATUS`
- `SUSPEND_SYSTEM`
- `RESUME_SYSTEM`
- `REVOKE_SYSTEM`
- `NEGOTIATE_VERSION`
- `GET_DOMAIN_STATUS`
- `DEACTIVATE_DOMAIN`
- `DISCOVER_CAPABILITIES`

Runtime communication:

- `HEALTH_CHECK`
- `PUBLISH_LIFECYCLE_EVENT`
- `REQUEST_INTELLIGENCE`
- `EXCHANGE_APPROVED_DATA`
- `QUERY_AUDIT`

Mutations accept idempotency keys. Connector lifecycle and domain deactivation require PBOS governance authority. Runtime operations require an active certified connector, active domain, active mapped identity, explicit purpose, PBOS-resolved authority, and the communication-specific permission. Data exchange additionally requires classification and an approval ID.
