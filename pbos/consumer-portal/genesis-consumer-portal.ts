import { BULLETPROOF_BENEFICIARY_BRAND, PBOS_GENESIS_BRAND, PLAYBOOK_PLATFORM_BRAND } from "../brand-system";
import { applicationsComponent, factoryStepsComponent, footerComponent, heroComponent, navigationComponent } from "./components";
import type { GenesisPortalModel } from "./contracts";
import { GENESIS_PORTAL_STYLES } from "./styles";

export const GENESIS_CONSUMER_PORTAL: GenesisPortalModel = {
    eyebrow: "PBOS Genesis — the operating system factory",
    title: "Build. Power. Evolve your ecosystem.",
    summary: "Turn a mission into a governed operating system and launch distinct web and mobile applications on the shared PBOS v1 foundation.",
    primaryAction: { label: "Build your platform", href: "#build" },
    secondaryAction: { label: "Explore applications", href: "#applications" },
    applications: [
        {
            systemId: "PLAYBOOK-SYSTEM-001", name: "The Playbook",
            description: "The opportunity operating system for education, development, careers, and connected journeys.",
            audience: "scholars, athletes, educators, mentors, families, and communities",
            href: "#the-playbook", brand: PLAYBOOK_PLATFORM_BRAND
        },
        {
            systemId: "BULLETPROOF-SYSTEM-001", name: "Bulletproof Beneficiary & Legacy Registry",
            description: "A secure legacy operating system for beneficiary discovery, family continuity, records, and generational planning.",
            audience: "beneficiaries, families, advisors, and legacy stewards",
            href: "#bulletproof-beneficiary", brand: BULLETPROOF_BENEFICIARY_BRAND
        }
    ]
};

export function renderGenesisConsumerPortal(model = GENESIS_CONSUMER_PORTAL): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#020F21"><title>${PBOS_GENESIS_BRAND.product} — ${PBOS_GENESIS_BRAND.tagline}</title><style>${GENESIS_PORTAL_STYLES}</style></head><body><div class="site-shell">${navigationComponent()}<main>${heroComponent(model, PBOS_GENESIS_BRAND)}${applicationsComponent(model.applications)}${factoryStepsComponent()}</main>${footerComponent()}</div></body></html>`;
}
