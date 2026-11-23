# PBOS-MB03-OPERATOR-REG-001 — Hosted Ed25519 signing identity review

**Status:** PENDING INDEPENDENT REVIEW — not activated.  
**Purpose:** Reviewable evidence record for MB-03 staging signing identity registration.  
**Related issue:** https://github.com/sgwalton87/PBOS-CORE/issues/139

## Authority and boundaries

- Executive authorization and custodian acceptance: [PBOS-RCC-001 Decision Log, row 27](https://docs.google.com/spreadsheets/d/12ALDMBbQOPIT9lGSzT-RfqY5S_TMdtPO4Wwi00Xo0kI/edit#gid=610008&range=A27:F27). The recorded decision approves **key creation only**, not activation, mission execution, or deployment.
- Governing text: [PPS-012 v1.1.0 — Hosted Signing Authority](https://github.com/sgwalton87/playbook-platform/blob/main/docs/PPS/PPS-012_SECURITY_AND_PERMISSIONS.md), adopted through [PR #324](https://github.com/sgwalton87/playbook-platform/pull/324).
- Proposed signer/custodian: Viveca Walton. Scope: **staging only**, **MB03-MISSION-001** and **MB03-MISSION-002**. No production authorization.
- Existing Genesis HMAC authority is unchanged. Each mission and deployment requires separate approval.

## Public-key evidence

- Algorithm: **Ed25519**.
- [Public PEM](https://drive.google.com/file/d/1phOAaaO_W6PV38Ek9d57omRiISJVAeeR/view)
- [Public DER (SPKI)](https://drive.google.com/file/d/1857Mt0LyOvjGn24AEVcK5Xa4pNPvVFS-/view)
- SHA-256 of public-key DER/SPKI: `db04246cbc743ba2c75652de473ea3aba8e558f954826dd6e30d8bd0425bcff0`.
- The submitted PEM was parsed as an Ed25519 public key; re-encoding it to DER and hashing the uploaded DER both produced the fingerprint above. This checks public-file consistency only, **not** proof of private-key custody or approval by an independent reviewer.
- **Never upload private-key material, encrypted disk image, or passphrases to this repository or the public handoff folder.**

## Required independent reviewer checks

- [ ] Reviewer identity and independence established (neither executive approver nor key custodian).
- [ ] Independently download public PEM and DER; confirm Ed25519, matching SPKI bytes and SHA-256 fingerprint.
- [ ] Confirm executive authority, written custodian acceptance, and staging-only scope against Decision Log row 27 and PPS-012.
- [ ] Review evidence of private-key custody: encrypted drive, exclusive custodian access, lock/unmount practice, recovery and backup arrangements. **Do not request the private key or passphrase.**
- [ ] Verify documented key rotation and revocation process, including who can revoke, how the hosted trust binding is removed, and how prior signatures are handled.
- [ ] Record decision, reviewer identity, actual date, findings, and evidence in the GitHub PR review and Decision Log.

## Decision and activation

**Independent reviewer decision: PENDING.** Reviewers should use GitHub **Files changed → Review changes → Approve** only after all applicable checks pass; otherwise select **Request changes** and specify missing evidence. A GitHub approval is not itself an activation or deployment authorization. Do not bind this public key to protected staging or execute MB-03 missions until all independent registration checks and separate activation controls pass.
