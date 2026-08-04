# PBOS Connector SDK

The connector SDK is the versioned application-facing contract for PBOS v1. External applications use `PbosConnectorClient` with an injected transport; they do not import kernel, runtime, intelligence, or governance internals.

The initial protocol supports governed system registration, system certification, domain registration and activation, identity mapping, and runtime health communication. HTTP delivery is available through `PbosHttpTransport` and the PBOS service-side `PbosNodeHttpAdapter`.

Package publication is a separate distribution lifecycle step. Until publication, the `v1` wire contract remains the integration authority.
