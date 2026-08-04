# PBOS v1 API

`PbosV1Api` provides the transport-neutral PBOS service boundary. Governance callbacks are mandatory constructor dependencies so an application cannot self-certify, activate a domain, or manufacture an authority decision.

`PbosNodeHttpAdapter` exposes the API at `POST /pbos/v1` without coupling the core service to an application framework. Deployment composition supplies certification, activation, and runtime authority providers.
