import { ProductBrandSpec } from "./contracts";

export const PLAYBOOK_PLATFORM_BRAND: ProductBrandSpec = {
    brandId: "PLAYBOOK-PLATFORM-BRAND-001",
    product: "Playbook Platform",
    tagline: "Connect. Empower. Achieve.",
    colors: [
        { name: "Playbook Black", value: "#0D0D0F", role: "Primary canvas" },
        { name: "Playbook Cream", value: "#F2E6D0", role: "Primary text and light surface" },
        { name: "Playbook Copper", value: "#8B4A1F", role: "Primary brand accent" },
        { name: "Playbook Gold", value: "#D4AF37", role: "Achievement and opportunity accent" },
        { name: "Playbook Sand", value: "#C8B089", role: "Supporting neutral" }
    ],
    headingFont: "Montserrat, Inter, system-ui, sans-serif",
    bodyFont: "Inter, system-ui, sans-serif",
    asset: {
        assetId: "PLAYBOOK-PLATFORM-MASTER-BOARD-001",
        product: "Playbook Platform", role: "MASTER_REFERENCE",
        sourcePath: "assets/brand/playbook-platform/playbook-platform-master-brand-board.png",
        width: 1536, height: 1024, format: "PNG",
        approvedSurfaces: ["FACTORY_PORTAL", "DOCUMENTATION", "SOCIAL", "APP_LAUNCHER"],
        minimumWidth: 320,
        clearSpaceRule: "Keep clear space equal to the inner counter width of the P mark on every side.",
        backgroundRules: ["Prefer Playbook Black.", "Use cream only for approved light treatments.", "Maintain readable contrast and an uncluttered field."]
    },
    usageRules: [
        "Use this identity only for Playbook Platform and its approved application surfaces.",
        "Do not label Playbook Platform as PBOS Genesis.",
        "Do not stretch, skew, crop, recolor, or rearrange the approved lockups.",
        "Preserve the tagline exactly: Connect. Empower. Achieve.",
        "The supplied board is a reference; store and production use require approved transparent exports."
    ]
};
