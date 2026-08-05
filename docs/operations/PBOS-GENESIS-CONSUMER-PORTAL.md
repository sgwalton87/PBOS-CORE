# PBOS Genesis Consumer Portal

Status: READY FOR HUMAN VALIDATION

## Purpose

The consumer portal is the public front door for the PBOS Genesis system factory. It is implemented as semantic, dependency-free components so the canonical experience can be embedded in a generated Next.js application without coupling PBOS Core to one frontend framework.

## Brand hierarchy

- **PBOS Genesis** owns global navigation, the factory hero, build journey, and footer.
- **The Playbook** appears only on its application card and Playbook-owned destinations.
- **Bulletproof Beneficiary & Legacy Registry** appears only on its application card and Bulletproof-owned destinations.
- Application identities never replace the PBOS Genesis factory identity.

The current PNG boards are approved design references. Transparent production SVG/PNG lockups remain a pre-launch asset gate.

## Local operator preview

After installing dependencies:

```bash
npm run pbos:portal
```

Open `http://127.0.0.1:4173`. Set `PBOS_PORTAL_PORT` to use another local port.

## Responsive behavior

- Wide screens use a two-column hero, two independent application cards, and five-step factory flow.
- Tablet screens collapse applications and the hero to one column.
- Mobile screens use single-column actions, application content, build steps, and footer.
- Semantic landmarks, descriptive logo alternatives, reduced-motion support, and scalable type are included.

## Next implementation boundary

The portal calls-to-action are presentation-safe anchors in PBOS Core. Authentication, customer intake submission, payments, organization tenancy, and hosted deployment belong to the commercial portal application and require separate certification before public launch.
