# MB-03 staging signing key — rotation and revocation runbook (PROPOSED)

**Status:** Proposed for independent review; not an approved operational control.  
**Scope:** PBOS-MB03-OPERATOR-REG-001; MB03-MISSION-001 and MB03-MISSION-002 staging only.  
**Owner of private key:** named custodian Viveca Walton. No private material may enter GitHub, Drive public folders, logs, or chat.

## Triggers

Revoke on suspected key disclosure, lost custody, unauthorized signing, unexpected signer behavior, custodian departure, or scope expiration. Rotate before expiry or when authorized scope/custody changes. Stop new signing immediately on suspected compromise.

## Proposed execution steps

1. Executive Director or authorized delegated operator records incident/rotation decision, reason, time, scope and acting identity in PBOS-RCC-001; emergency disablement may precede formal approval if necessary to stop compromise, with retrospective incident review.
2. Authorized hosted infrastructure operator **disables the old public-key trust binding** in the staging verifier and confirms the disabled fingerprint is rejected. Do not remove or change Genesis HMAC authority.
3. Suspend MB-03 staging mission execution until the old signer is rejected and a new registration has passed PPS-012 approval.
4. Custodian generates replacement Ed25519 key in protected storage, provides only public PEM/DER and fingerprint, and records custody acceptance. Never copy or disclose private material.
5. Independent reviewer (not approver or custodian) checks authority, fingerprint, scope, custody controls and this runbook; records verification findings in a new PR and Decision Log entry.
6. After separate activation authorization, authorized infrastructure operator registers replacement public key with exact staging scope, verifies successful signatures and rejection of old signatures, and records deployment identifier, time, verifier configuration revision and test outputs.
7. Preserve immutable historical mission artifacts and signatures with signing-key ID and verification policy at time of signing. Mark revoked keys and compromise effective time; do not silently rewrite history or erase audit logs.
8. Record closure evidence, affected missions, notification recipients, and follow-up monitoring. Retire obsolete private key securely under custodian control according to approved retention policy.

## Acceptance tests required before this runbook can be approved

- [ ] Identify actual hosted verifier, trust registry/configuration path, and authorized operator with access.
- [ ] Prove old-key signature rejected after disabling trust in disposable staging; capture logs without secrets.
- [ ] Prove replacement-key signature accepted **only** within approved scope and not in production.
- [ ] Confirm audit log records revocation, rotation, actor, key ID, and timestamp.
- [ ] Confirm rollback does not inadvertently reactivate a compromised key.
- [ ] Independent reviewer signs off and Executive Director separately authorizes activation.

**No execution, rotation, revocation or activation has occurred by creating this document.**
