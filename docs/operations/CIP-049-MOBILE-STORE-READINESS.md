# CIP-049 Mobile and Store Readiness

## Status

DELIVERY FOUNDATION PREPARED — APPLICATION MATERIALIZATION AND STORE ACCOUNTS PENDING

## Delivery architecture

PBOS generates one governed application model with three explicit targets: responsive web, iOS, and Android. Shared contracts, PBOS connector behavior, design tokens, validation rules, and provenance remain portable. Native secure storage, deep links, notifications, signing, entitlements, and store packaging remain platform-specific.

The factory now prepares:

- web accessibility and responsive-delivery manifest
- iOS bundle identifier and Android application identifier
- mobile application configuration
- internal, preview, and production build profiles
- native secure-storage boundary
- universal-link/deep-link boundary
- privacy and store-readiness checklist
- explicit protected actions for signing, credential upload, store submission, and production release

## Store gates

- [x] Web/iOS/Android delivery blueprint generator prepared
- [x] Apple and Google requirements represented independently
- [x] Tests prepared for shared and platform-specific boundaries
- [x] Approved brand assets, design tokens, and journey contracts included in delivery output
- [x] Secure-storage, deep-link, and notification-consent interfaces prepared
- [x] Web/iOS/Android release-evidence verifier prepared
- [ ] Materialize delivery files in Playbook through an approved PR
- [ ] Implement and validate primary mobile journeys
- [ ] Configure Apple Developer ownership and signing
- [ ] Configure Google Play ownership and signing
- [ ] Approve privacy disclosures and store assets
- [ ] Pass physical-device accessibility and security validation
- [ ] Pass TestFlight review
- [ ] Pass Google Play internal testing
- [ ] Approve store submissions
- [ ] Human CIP-049 certification issued

PBOS does not create developer accounts, accept legal agreements, upload signing credentials, or submit an application without the account owner and an explicit protected approval.

After web staging, TestFlight, and Google Play internal-testing evidence exists at the same application revision, verify the combined release candidate with:

```bash
PBOS_APPLICATION_RELEASE_EVIDENCE_PATH=/protected/path/playbook-release.json npm run pbos:evidence:application-release
```

This command verifies evidence and stops before Apple App Store or Google Play submission.
