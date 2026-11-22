# MB-03 signing registration — evidence assessment (2026-11-22)

**Assessment prepared by:** ChatGPT, evidence-gathering assistant. **Not an independent authorized reviewer or an attestation by PlaybookNoReply.**

**Disposition: CHANGES REQUIRED / REGISTRATION NOT YET VERIFIED.** This assessment is not a GitHub approval, custodian attestation, or authority to activate a signer.

## Evidence actually inspected

| Check | Finding | Result |
| --- | --- | --- |
| PPS-012 authority | Read canonical PPS-012 v1.1.0 at commit `6bfa55c69f50b8872f8509a2e8f4e1fe8e415fea`; Hosted Signing Authority requires an independent reviewer, signer/custodian, fingerprint, scope, rotation/revocation. | Requirement confirmed |
| Executive authorization | Read PBOS-RCC-001 Decision Log row 27, record `PBOS-MB03-OPERATOR-REG-001-APPROVAL`; approves **creation only** for two named staging missions. | Recorded, activation not authorized |
| Custodian acceptance | Row 27 quotes Viveca Walton accepting custody; this is an acceptance attributed by the Executive Director, not independently authenticated custodian testimony. | Recorded; independent confirmation pending |
| Public DER presence | Google Drive metadata confirms `mb03-staging-public.der`, 44 bytes, public-reader permission, file ID `1857Mt0LyOvjGn24AEVcK5Xa4pNPvVFS-`. | File presence verified; contents not downloaded in this assessment |
| Public fingerprint | Claimed SHA-256 SPKI: `db04246cbc743ba2c75652de473ea3aba8e558f954826dd6e30d8bd0425bcff0`. Earlier registration document reports matching PEM/DER, but this assessment did not independently rehash the bytes. | Independent fingerprint verification pending |
| GitHub review | PR #140 has an `APPROVED` review by `PlaybookNoReply`; its body reproduces a **request to review**, without verification findings. | Formal UI approval exists; evidentiary review not demonstrated |
| Custody | Encrypted-drive custody described in handoff; no independent inspection of access, recovery, backup, or unmount controls in this assessment. | Pending |
| Rotation/revocation | No approved, tested key rotation/revocation runbook evidenced in the material examined. | Pending |

## Required closure evidence

1. An identified reviewer who is **neither the Executive Director approver nor Viveca Walton** must independently download the public PEM and DER and record the actual Ed25519/SPKI verification commands, outputs and fingerprint.
2. Reviewer must verify scope against the source Decision Log and authority in PPS-012; establish reviewer independence and authority.
3. Obtain a documented rotation/revocation procedure (trigger, authorized actor, disabling hosted trust, replacement registration, audit trail, handling prior signatures), and evidence of custodian security controls without exposing private material.
4. Independent reviewer must record **their own** findings and disposition on PR #140 and in the Decision Log. An approval whose body merely repeats instructions is not sufficient evidence.
5. Staging trust binding, mission execution, and certification remain separate gates; **MB-03 stays 0/2 certified**.

## Source links

- [PR #140](https://github.com/sgwalton87/PBOS-CORE/pull/140) and [Issue #139](https://github.com/sgwalton87/PBOS-CORE/issues/139)
- [Canonical PPS-012 v1.1.0](https://github.com/sgwalton87/playbook-platform/blob/6bfa55c69f50b8872f8509a2e8f4e1fe8e415fea/docs/PPS/PPS-012_SECURITY_AND_PERMISSIONS.md)
- [Decision Log row 27](https://docs.google.com/spreadsheets/d/12ALDMBbQOPIT9lGSzT-RfqY5S_TMdtPO4Wwi00Xo0kI/edit#gid=610008&range=A27:H27)
- [Public PEM](https://drive.google.com/file/d/1phOAaaO_W6PV38Ek9d57omRiISJVAeeR/view) / [Public DER](https://drive.google.com/file/d/1857Mt0LyOvjGn24AEVcK5Xa4pNPvVFS-/view)
