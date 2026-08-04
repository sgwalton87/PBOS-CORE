# @pbos/connector-sdk

Standalone PBOS v1 connector client and conformance kit. The package imports no PBOS Core source and can be installed by independently owned application repositories.

Privileged credentials belong only in a server-side transport. Browser code may use `ConnectorSdkClient` with an application-owned transport that calls its own server boundary; it must never receive `PBOS_CONNECTOR_SECRET`.

## Upgrade policy

- Patch releases preserve wire and source compatibility.
- Minor releases add backward-compatible helpers and schema versions.
- Major releases may remove deprecated behavior only after its published sunset.
- Applications must run conformance before accepting an SDK upgrade.
- Production promotion remains human-certified.
