import {
    BULLETPROOF_BENEFICIARY_BRAND
} from "./bulletproof-beneficiary-brand";
import { PBOS_GENESIS_BRAND } from "./pbos-genesis-brand";
import { PLAYBOOK_PLATFORM_BRAND } from "./playbook-platform-brand";

export const PBOS_GENESIS_PORTAL_CANON = {
    canonId: "PBOS-GENESIS-PORTAL-CANON-001",
    status: "DESIGN_REFERENCE",
    logoAssignments: {
        factory: {
            brandId: PBOS_GENESIS_BRAND.brandId,
            product: PBOS_GENESIS_BRAND.product,
            placement: "Global navigation, Genesis hero, factory dashboard, and footer"
        },
        playbookApplication: {
            brandId: PLAYBOOK_PLATFORM_BRAND.brandId,
            product: PLAYBOOK_PLATFORM_BRAND.product,
            placement: "Playbook application cards and Playbook-owned destinations only"
        },
        bulletproofApplication: {
            brandId: BULLETPROOF_BENEFICIARY_BRAND.brandId,
            product: BULLETPROOF_BENEFICIARY_BRAND.product,
            placement: "Bulletproof application cards and Bulletproof-owned destinations only"
        }
    },
    renderings: [
        "assets/brand/pbos-genesis/portal-mockups/01-genesis-portal-master-board-v3.png",
        "assets/brand/pbos-genesis/portal-mockups/02-genesis-marketplace-dashboard-v3.png",
        "assets/brand/pbos-genesis/portal-mockups/03-genesis-ecosystem-overview-v3.png",
        "assets/brand/pbos-genesis/portal-mockups/04-genesis-long-form-landing-v3.png",
        "assets/brand/pbos-genesis/portal-mockups/05-genesis-operations-suite-v3.png"
    ],
    protectedClaims: [
        "PBOS Genesis is the system factory.",
        "PBOS v1 is the shared operating-system foundation.",
        "The Playbook and Bulletproof Beneficiary & Legacy Registry are independent applications.",
        "No product may borrow, combine, or substitute another product's logo."
    ]
} as const;
