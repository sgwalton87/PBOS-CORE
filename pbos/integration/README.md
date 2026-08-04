# PBOS v1 Integration Architecture

PBOS Core owns the reusable operating-system integration boundary. External repositories own their domain applications, user experiences, workflows, and product-specific behavior.

## Permanent boundary

External applications connect through governed contracts:

```text
Application Repository
        ↓
PBOS Connector
        ↓
PBOS Runtime
        ↓
PBOS Kernel
```

PBOS Core must not import, copy, merge, or recreate external application logic. Public repository access may be used for architecture understanding, contract alignment, and integration planning only.

## Connector lifecycle

1. Register the external and PBOS system identities.
2. Register domains, capabilities, workflows, required services, and governance requirements.
3. Map external actors to PBOS identities with authority and provenance preserved.
4. Discover only active, certified, permission-compatible capabilities.
5. Communicate through typed, authorized runtime channels.

## Runtime communication

Supported channels are:

- lifecycle events;
- health checks;
- intelligence requests;
- approved, classified data exchange.

Every channel fails closed when connector certification, domain status, communication rules, permissions, authority, purpose, handlers, or required data-exchange approval is missing.

Domain-specific adapters may implement these contracts in their owning repositories. They must not move domain behavior into PBOS Core.
