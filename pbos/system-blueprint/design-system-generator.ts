import {
    BrandIntake,
    DesignAccessibilityReport,
    DesignTokens,
    DomainKind
} from "./contracts";

const DOMAIN_PALETTES: Readonly<Record<DomainKind, readonly [string, string, string]>> = {
    EDUCATION: ["#2457C5", "#4F46A5", "#E8792E"],
    HEALTHCARE: ["#0F766E", "#2563A6", "#D65F59"],
    FINANCE: ["#1E3A5F", "#536878", "#B7791F"],
    GOVERNMENT: ["#344054", "#365F91", "#9A6700"],
    LEGACY_PLANNING: ["#5B466F", "#746253", "#A66A3F"],
    WORKFORCE: ["#8A4614", "#3F5F73", "#C27A18"],
    COMMUNITY: ["#6B3FA0", "#287271", "#D1603D"],
    CUSTOM: ["#374151", "#4B6478", "#A85D32"]
};

export class DesignSystemGenerator {
    generate(domain: DomainKind, brand: BrandIntake): { tokens: DesignTokens; accessibility: DesignAccessibilityReport } {
        const recommended = DOMAIN_PALETTES[domain];
        const primary = this.accessiblePrimary(this.normalize(brand.primaryColor) ?? recommended[0]);
        const secondary = this.normalize(brand.secondaryColor) ?? recommended[1];
        const accent = this.normalize(brand.accentColor) ?? recommended[2];
        const radius = brand.cornerStyle === "SHARP" ? ["0px", "2px", "4px"]
            : brand.cornerStyle === "SUBTLE" ? ["4px", "8px", "12px"]
            : brand.cornerStyle === "ROUNDED" ? ["8px", "14px", "22px"]
            : ["10px", "20px", "32px"];
        const tokens: DesignTokens = {
            colors: {
                primary,
                primaryHover: this.adjust(primary, -18),
                secondary,
                accent,
                background: "#FFFFFF",
                surface: "#F7F9FC",
                text: "#111827",
                textMuted: "#5B6472",
                border: "#D5DAE3",
                success: "#18794E",
                warning: "#9A5B00",
                danger: "#B42318"
            },
            typography: this.typography(brand),
            radius: { small: radius[0], medium: radius[1], large: radius[2] },
            spacingUnit: "4px",
            density: brand.density,
            themes: brand.theme === "BOTH" ? ["LIGHT", "DARK"] : [brand.theme]
        };
        return { tokens, accessibility: this.audit(tokens) };
    }

    audit(tokens: DesignTokens): DesignAccessibilityReport {
        const normalTextContrast = this.contrast(tokens.colors.primary, "#FFFFFF");
        const largeTextContrast = normalTextContrast;
        const semanticColorsDistinct = new Set([
            tokens.colors.success, tokens.colors.warning, tokens.colors.danger, tokens.colors.primary
        ]).size === 4;
        const remediations: string[] = [];
        if (normalTextContrast < 4.5) remediations.push("Darken the interactive primary color for normal white text.");
        if (!semanticColorsDistinct) remediations.push("Use distinct colors for primary, success, warning, and danger states.");
        return {
            normalTextContrast,
            largeTextContrast,
            normalTextPass: normalTextContrast >= 4.5,
            largeTextPass: largeTextContrast >= 3,
            focusVisible: true,
            semanticColorsDistinct,
            passed: normalTextContrast >= 4.5 && semanticColorsDistinct,
            remediations
        };
    }

    private typography(brand: BrandIntake): { heading: string; body: string } {
        if (brand.personalities.includes("PREMIUM")) return { heading: "Source Serif 4", body: "Inter" };
        if (brand.personalities.includes("YOUTHFUL") || brand.personalities.includes("BOLD")) {
            return { heading: "Space Grotesk", body: "Inter" };
        }
        return { heading: "Inter", body: "Inter" };
    }

    private accessiblePrimary(color: string): string {
        let candidate = color;
        for (let attempt = 0; attempt < 12 && this.contrast(candidate, "#FFFFFF") < 4.5; attempt += 1) {
            candidate = this.adjust(candidate, -10);
        }
        return candidate;
    }

    private normalize(color?: string): string | undefined {
        if (!color) return undefined;
        const normalized = color.startsWith("#") ? color.toUpperCase() : `#${color.toUpperCase()}`;
        if (!/^#[0-9A-F]{6}$/.test(normalized)) throw new Error(`Invalid six-digit hexadecimal color: ${color}`);
        return normalized;
    }

    private adjust(color: string, amount: number): string {
        const components = [1, 3, 5].map(index => Math.max(0, Math.min(255, Number.parseInt(color.slice(index, index + 2), 16) + amount)));
        return `#${components.map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    }

    private contrast(first: string, second: string): number {
        const firstLuminance = this.luminance(first);
        const secondLuminance = this.luminance(second);
        return Number(((Math.max(firstLuminance, secondLuminance) + 0.05) /
            (Math.min(firstLuminance, secondLuminance) + 0.05)).toFixed(2));
    }

    private luminance(color: string): number {
        const channels = [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16) / 255)
            .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
}
