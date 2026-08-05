# PBOS Genesis Portal Style Canon

Status: DESIGN REFERENCE

This canon governs the consumer-facing PBOS Genesis portal and its presentation of independently branded applications.

## Product identity

| Product | Role | Required mark | Allowed placement |
| --- | --- | --- | --- |
| PBOS Genesis | System factory | Copper strategy-play `P` with PBOS Genesis lockup | Global navigation, Genesis hero, factory dashboard, footer |
| The Playbook | Education and opportunity application | Dimensional Playbook `P` and The Playbook lockup | The Playbook cards and destinations |
| Bulletproof Beneficiary & Legacy Registry | Legacy-planning application | Crowned, winged `B` and registry lockup | Bulletproof cards and Bulletproof-owned destinations |

Each product is visually sovereign. Never substitute one mark for another, create a shared hybrid mark, or imply that Playbook powers PBOS Genesis.

## Architecture language

Approved:

- PBOS Genesis is the system factory.
- PBOS v1 is the shared operating-system foundation.
- The Playbook and Bulletproof Beneficiary & Legacy Registry are independent applications built on that foundation.

Forbidden:

- “PBOS Genesis powered by Playbook OS.”
- A winged `B` representing PBOS Genesis.
- A Playbook `P` representing PBOS Genesis or Bulletproof.
- A PBOS Genesis `P` presented as either application's app icon.

## Visual system

- Canvas: deep navy-to-black with restrained elevation.
- Genesis accents: copper, amber-gold, and warm ivory.
- Typography: strong geometric headings and highly readable sans-serif body copy.
- Borders: one-pixel warm-gold rules at low contrast.
- Cards: consistent radius, padding, hierarchy, and hover/focus affordances.
- Product cards may inherit the application's approved secondary accent, but the surrounding portal remains Genesis-owned.
- Responsive layouts must preserve logo clear space and never compress lockups into illegibility.

## Canonical renderings

The five renderings in `assets/brand/pbos-genesis/portal-mockups/` define the current portal direction:

1. Master portal and operations board.
2. Marketplace and operator dashboard.
3. Factory-to-application ecosystem overview.
4. Long-form landing page.
5. Factory operations suite.

## Production handoff

Before implementation certification:

1. Replace raster logo crops with owner-approved transparent SVG/PNG exports.
2. Confirm exact font licenses and token values.
3. Build responsive components from this canon rather than embedding a flat mockup.
4. Verify keyboard focus, contrast, zoom, reduced motion, and mobile breakpoints.
5. Test that every application record resolves its own `brandId` and logo asset.
