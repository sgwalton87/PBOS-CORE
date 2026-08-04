import { ProductBrandSpec } from "./contracts";

export const BULLETPROOF_BENEFICIARY_ICON_SUITE = [
    "FAMILY_MANAGEMENT", "EDUCATION_RESOURCES", "SCHOLARSHIPS_AND_GRANTS", "FINANCIAL_LITERACY",
    "WEALTH_BUILDING", "ESTATE_PLANNING", "ASSET_PROTECTION", "INVESTMENTS_AND_GROWTH",
    "FINANCIAL_REPORTS", "SAVINGS_VAULT", "ACHIEVEMENTS_AND_REWARDS", "BADGES_AND_CERTIFICATIONS",
    "MENTORSHIP_AND_GUIDANCE", "COMMUNITY_NETWORK", "GIVING_AND_IMPACT", "LEGACY_PLANNING",
    "TRUSTS_AND_WILLS", "LEGAL_DOCUMENTS", "SECURITY_CENTER", "ACCESS_MANAGEMENT", "NOTIFICATIONS",
    "MESSAGES", "EVENTS", "TASKS_AND_ACTIONS", "DOCUMENTS_VAULT", "UPLOAD_AND_STORAGE", "SEARCH",
    "PROFILE_MANAGEMENT", "SETTINGS", "SUPPORT_CENTER", "DASHBOARD", "GOALS_AND_PLANNING",
    "MILESTONES", "RECOMMENDATIONS", "COMPASS_AI", "OPPORTUNITIES", "PIPELINE", "GLOBAL_ACCESS",
    "VERIFICATION_CENTER", "COMPLIANCE_AUDIT"
] as const;

export const BULLETPROOF_BENEFICIARY_BRAND: ProductBrandSpec = {
    brandId: "BULLETPROOF-BENEFICIARY-BRAND-001",
    product: "Bulletproof Beneficiary & Legacy Registry",
    tagline: "Built to Leave a Legacy.",
    colors: [
        { name: "Legacy Gold", value: "#D4AF37", role: "Primary accent" },
        { name: "Legacy Cream", value: "#F2E3C2", role: "Primary text and light treatment" },
        { name: "Registry Black", value: "#0D0D0F", role: "Primary canvas" },
        { name: "Registry Charcoal", value: "#1B1B1E", role: "Elevated surface" },
        { name: "Legacy Green", value: "#1E5631", role: "Stewardship, success, and verified state" }
    ],
    headingFont: "Approved logo artwork; UI heading font requires owner selection",
    bodyFont: "Inter, system-ui, sans-serif",
    asset: {
        assetId: "BULLETPROOF-BENEFICIARY-MASTER-BOARD-001",
        product: "Bulletproof Beneficiary & Legacy Registry", role: "MASTER_REFERENCE",
        sourcePath: "assets/brand/bulletproof-beneficiary/bulletproof-beneficiary-master-brand-board.png",
        width: 1685, height: 933, format: "PNG",
        approvedSurfaces: ["FACTORY_PORTAL", "DOCUMENTATION", "SOCIAL", "APP_LAUNCHER"],
        minimumWidth: 320,
        clearSpaceRule: "Keep clear space equal to the crown height on every side of an approved lockup.",
        backgroundRules: ["Prefer Registry Black.", "Use Legacy Cream only for an approved light treatment.", "Reserve Legacy Green for verified and stewardship states, not decorative recoloring."]
    },
    usageRules: [
        "Use this identity only for Bulletproof Beneficiary & Legacy Registry.",
        "Do not substitute the PBOS Genesis or Playbook Platform identity.",
        "Preserve the crown, wings, registry name, establishment date, and approved proportions.",
        "Do not stretch, skew, crop, recolor, or rebuild the logo lettering with an unapproved font.",
        "Production and store use require approved transparent and vector exports."
    ]
};
