# PBOS-CIP-037 Certification

## Status

READY FOR CERTIFICATION

## Reproducible Application Scaffolds

CIP-037 corrects the systemic defect identified by Bulletproof Beneficiary PR #2. PBOS generated `package.json`, TypeScript configuration, and the Next.js App Router entry point, but the initial application-build pipeline committed before generating the dependency lock.

The scaffold contract now declares an NPM lockfile as a required generated artifact. The generator owns materialization order:

1. Write all scaffold files.
2. Generate `package-lock.json` from the selected dependency manifest.
3. Return the complete generated-path set.
4. Commit source, configuration, entry point, and lockfile together.

This applies to every future application using the PBOS scaffold generator. It is not a Bulletproof-specific patch.

## Required Baseline Artifacts

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `next-env.d.ts`
- `next.config.mjs`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `vitest.config.ts`
- CI using `npm ci`

## Tests Prepared

- Required lockfile contract
- Deterministic materialization order
- Complete generated path set
- TypeScript configuration presence
- Next.js entry-point presence

## Promotion Boundary

Bulletproof PR #2 should remain unmerged until this PBOS Core correction is certified and a regenerated or remediated application revision includes the complete baseline.

## Validation Commands Ready

```bash
npm run typecheck
npm test
npm run build
```
