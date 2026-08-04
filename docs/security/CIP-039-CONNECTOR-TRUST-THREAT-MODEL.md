# CIP-039 Connector Trust Threat Model

## Protected boundary

The PBOS v1 HTTP boundary accepts requests from independently owned application repositories. An application identity is not PBOS authority. Every production connector request must be authenticated before PBOS evaluates the requested operation.

## Threats and controls

| Threat | Control |
| --- | --- |
| Application self-issues authority | Credential issuance requires PBOS governance approval |
| Credential theft | Secrets remain behind a secret-provider interface; metadata contains no secret |
| Request tampering | HMAC-SHA256 covers method, path, tenant, connector, key, timestamp, nonce, and body digest |
| Timing disclosure | Signatures use constant-time comparison |
| Replay | Timestamp window and single-use nonce store |
| Cross-tenant credential use | Organization and connector must match credential metadata |
| Excess privilege | Credential operation scopes are enforced after authenticated body parsing |
| Revoked or expired credential | Status, expiry, and secret availability are checked on every request |
| Resource exhaustion | Request-size and tenant/connector rate limits |
| Browser or proxy data retention | `no-store`, `nosniff`, restrictive CSP, and no-referrer headers |
| Secret leakage in evidence | Recursive sensitive-key redaction |

## Trust assumptions

- Production secret material is supplied by an approved deployment secret manager.
- TLS termination is mandatory in production and occurs at an approved ingress.
- Service clocks are synchronized within the configured request window.
- Credential metadata storage is restricted to the PBOS service account.
- Distributed production deployments use `RepositoryReplayNonceStore`; the in-memory implementation is limited to deterministic local execution and tests.

## Key lifecycle

1. A PBOS operator approves issuance for an organization, connector, and explicit scopes.
2. PBOS returns secret material once to the approved server-side application boundary.
3. Rotation issues a new key before revoking and removing the prior secret.
4. Suspension denies use while retaining metadata.
5. Revocation removes secret access and is irreversible for the key.
6. Compromise response revokes the key, inspects correlation and nonce evidence, and issues a separately approved replacement.

## Residual risks delegated to later CIPs

- Delivery retry and dead-letter guarantees: CIP-042
- Schema-level payload validation: CIP-041
- Metrics, traces, alerts, and incident commands: CIP-044
- Deployment ingress, TLS, secret-manager binding, and security rehearsal: CIP-047
