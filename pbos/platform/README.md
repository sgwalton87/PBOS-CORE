# PBOS Platform Orchestration

This package defines the stable orchestration boundary between PBOS Genesis, PBOS v1, and independently owned application repositories.

- `GenesisSystemFactory` coordinates compilation, domain-system generation, certification, and governed evolution proposals.
- `PbosV1ControlPlane` coordinates kernel initialization, domain activation, authority, missions, intelligence, and outcome observation.
- `RepositoryConnector` exposes provider-neutral repository inspection, proposal, approved dispatch, validation-evidence, and certified-promotion operations.

The package contains no Playbook Platform or Bulletproof Beneficiary application logic. Repository providers implement `RepositoryGateway`; PBOS Core retains governance and lifecycle enforcement while each application repository retains ownership of its product code.
