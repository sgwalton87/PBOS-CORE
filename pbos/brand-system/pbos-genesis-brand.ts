import { ProductBrandSpec } from "./contracts";

export const PBOS_GENESIS_BRAND: ProductBrandSpec = {
    brandId: "PBOS-GENESIS-BRAND-001",
    product: "PBOS Genesis",
    tagline: "Create. Power. Evolve.",
    colors: [
        { name: "Genesis Midnight", value: "#020F21", role: "Primary canvas" },
        { name: "Genesis Ink", value: "#07182D", role: "Elevated surface" },
        { name: "Genesis Ivory", value: "#F4EFE4", role: "Primary wordmark and text" },
        { name: "Genesis Copper", value: "#B65C18", role: "Mark depth and premium accent" },
        { name: "Genesis Gold", value: "#F5A12A", role: "Active accent and origin signal" }
    ],
    headingFont: "Space Grotesk, Inter, system-ui, sans-serif",
    bodyFont: "Inter, system-ui, sans-serif",
    asset: {
        assetId: "PBOS-GENESIS-MASTER-BOARD-001",
        product: "PBOS Genesis",
        role: "MASTER_REFERENCE",
        sourcePath: "assets/brand/pbos-genesis/pbos-genesis-master-brand-board.png",
        width: 1536,
        height: 1024,
        format: "PNG",
        approvedSurfaces: ["GENESIS_CONSOLE", "FACTORY_PORTAL", "DOCUMENTATION", "SOCIAL"],
        minimumWidth: 320,
        clearSpaceRule: "Keep clear space equal to the inner counter width of the P mark on every side.",
        backgroundRules: ["Prefer Genesis Midnight or Genesis Ink.", "Use the light-background treatment only on warm ivory.", "Maintain strong contrast and never place over a busy image."]
    },
    usageRules: [
        "Use this identity only for PBOS Genesis, the system factory.",
        "Do not use the Genesis mark as the Playbook Platform app icon.",
        "Do not stretch, skew, recolor, crop, add effects, or rearrange the lockup.",
        "The supplied PNG is a master visual reference; production lockups require approved transparent SVG or PNG exports.",
        "Preserve the tagline punctuation and wording exactly: Create. Power. Evolve."
    ]
};
