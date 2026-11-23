# MB-03 signing registration — evidence assessment (2026-11-22)

**Assessment prepared by:** ChatGPT, evidence-gathering assistant. **Not an independent authorized reviewer or an attestation by PlaybookNoReply.**

**Disposition: CHANGES REQUIRED / REGISTRATION NOT YET VERIFIED.** This assessment is not a GitHub approval, custodian attestation, or authority to activate a signer.

## Evidence actually inspected

| Check | Finding | Result |
| --- | --- | --- |
| PPS-012 authority | Read canonical PPS-012 v1.1.0 at commit `6bfa55c69f50b8872f8509a2e8f4e1fe8e415fea`; Hosted Signing Authority requires an independent reviewer, signer/custodian, fingerprint, scope, rotation/revocation. | Requirement confirmed |
| Executive authorization | Read PBOS-RCC-001 Decision Log row 27, record `PBOS-MB03-OPERATOR-REG-001-APPROVAL`; approves **creation only** for two named staging missions. | Recorded, activation not authorized |
| Custodian acceptance | Row 27 quotes Viveca Walton accepting custody; this is an acceptance attributed by the Executive Director, not independently authenticated custodian testimony. | Recorded; independent confirmation pending |
| Public DER presence | Google Drive metadata confirms `mb03-staging-public.der`, 44 bytes, public-reader permission, file ID `1857Mt0LyOvjGn24AEVcK5Xa4pNPvVFS-`. | File downloaded subsequently; 44-byte DER matched public PEM in local OpenSSL check |
| Public fingerprint | Downloaded public PEM and 44-byte DER directly from linked Drive files; OpenSSL parsed PEM as Ed25519, re-encoded PEM to DER and compared exact bytes (MATCH). Both SHA-256 digests equal `db04246cbc743ba2c75652de473ea3aba8e558f954826dd6e30d8bd0425bcff0`. | **PASS — public-key consistency verified on 2026-11-22** |
| GitHub review | PR #140 has an `APPROVED` review by `PlaybookNoReply`; its body reproduces a **request to review**, without verification findings. | Account operator confirmed by Executive Director to be the Executive Director herself (separate account). **Not independent; neither approval qualifies as PPS-012 independent review.** |
| Custody | Encrypted-drive custody described in handoff; no independent inspection of access, recovery, backup, or unmount controls in this assessment. | Pending |
| Rotation/revocation | No approved, tested key rotation/revocation runbook evidenced in the material examined. | Pending |

## Required closure evidence

1. The technical public-key check was executed by ChatGPT against downloaded Drive bytes, with matching OpenSSL output recorded below. An authorized reviewer independent of the approver and custodian must still assess and adopt the evidence under PPS-012.
2. Reviewer must verify scope against the source Decision Log and authority in PPS-012; establish reviewer independence and authority.
3. Obtain a documented rotation/revocation procedure (trigger, authorized actor, disabling hosted trust, replacement registration, audit trail, handling prior signatures), and evidence of custodian security controls without exposing private material.
4. Independent reviewer must record **their own** findings and disposition on PR #140 and in the Decision Log. An approval whose body merely repeats instructions is not sufficient evidence.
5. Staging trust binding, mission execution, and certification remain separate gates; **MB-03 stays 0/2 certified**.

## Reproducible public-key check (executed 2026-11-22)

```sh
openssl pkey -pubin -in mb03-staging-public.pem -text -noout
openssl pkey -pubin -in mb03-staging-public.pem -outform DER | shasum -a 256
shasum -a 256 mb03-staging-public.der.bin
cmp <(openssl pkey -pubin -in mb03-staging-public.pem -outform DER) mb03-staging-public.der.bin
```

Executed in local container against actual downloaded files on 2026-11-22: `ED25519 Public-Key`; both digests `db04246cbc743ba2c75652de473ea3aba8e558f954826dd6e30d8bd0425bcff0`; byte comparison `MATCH`. No private key was accessed. This verifies **public-key integrity only**, not reviewer independence, key custody, or activation.

## Source links

- [PR #140](https://github.com/sgwalton87/PBOS-CORE/pull/140) and [Issue #139](https://github.com/sgwalton87/PBOS-CORE/issues/139)
- [Canonical PPS-012 v1.1.0](https://github.com/sgwalton87/playbook-platform/blob/6bfa55c69f50b8872f8509a2e8f4e1fe8e415fea/docs/PPS/PPS-012_SECURITY_AND_PERMISSIONS.md)
- [Decision Log row 27](https://docs.google.com/spreadsheets/d/12ALDMBbQOPIT9lGSzT-RfqY5S_TMdtPO4Wwi00Xo0kI/edit#gid=610008&range=A27:H27)
- [Public PEM](https://drive.google.com/file/d/1phOAaaO_W6PV38Ek9d57omRiISJVAeeR/view) / [Public DER](https://drive.google.com/file/d/1857Mt0LyOvjGn24AEVcK5Xa4pNPvVFS-/view)

## One-command verification for macOS

Run `bash scripts/verify-mb03-public-key.sh /path/to/mb03-staging-public.pem /path/to/mb03-staging-public.der.bin` after downloading the two **public** files. Script exits nonzero on mismatch and never reads private-key material.

## Reviewer identity clarification (2026-11-22)

The Executive Director explicitly confirmed that `PlaybookNoReply` is a second GitHub account operated by the Executive Director. Therefore its two `APPROVED` reviews and later `COMMENTED` review cannot establish independent review under PPS-012. The GitHub UI may continue to display APPROVED, but registration remains **PENDING independent review**. An authorized individual who is neither the Executive Director nor Viveca Walton must independently assess the registration and custody evidence. No new PR is required.
