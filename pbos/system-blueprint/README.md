# System Blueprint Intake

The intake converts organization answers into a reviewable, machine-readable `SystemBlueprint`. It is interface-neutral and can be used by the Genesis terminal, Marketplace / Factory Portal, or an integration API.

PBOS v1 remains the shared foundation. Domain packs, capability packs, application strategy, governance, autonomy, and brand tokens are configured independently for each generated system.

Brand discovery accepts a logo card, logo and app-icon references, optional integrity digests, palette, typography, tagline, and usage guidance. The blueprint preserves these references durably, and the application scaffold emits `src/design/brand-source.json` so Genesis and PBOS v1 build work can consistently apply the approved product identity. Referenced assets are not fetched or published automatically; ownership, integrity, and production suitability remain governed review gates.
