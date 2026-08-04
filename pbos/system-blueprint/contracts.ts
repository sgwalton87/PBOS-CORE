import { AuthorityMode } from "../autonomous-authority";

export type DomainKind = "EDUCATION" | "HEALTHCARE" | "FINANCE" | "GOVERNMENT" | "LEGACY_PLANNING" | "WORKFORCE" | "COMMUNITY" | "CUSTOM";
export type CapabilityKind = "IDENTITY" | "WORKFLOWS" | "INTELLIGENCE" | "ANALYTICS" | "AUTOMATION" | "NOTIFICATIONS" | "DOCUMENTS" | "PAYMENTS" | "EVIDENCE" | "REPORTING" | "INTEGRATIONS";
export type ApplicationStrategy = "CREATE_NEW" | "CONNECT_EXISTING" | "BACKEND_ONLY" | "PBOS_INSTANCE_ONLY";
export type BrandPersonality = "TRUSTWORTHY" | "BOLD" | "WARM" | "PREMIUM" | "PROFESSIONAL" | "INNOVATIVE" | "CALM" | "YOUTHFUL" | "COMMUNITY_CENTERED";
export type VisualDirection = "PBOS_RECOMMENDED" | "EXISTING_BRAND" | "GUIDED_CUSTOM" | "MARKETPLACE_TEMPLATE";
export type ThemePreference = "LIGHT" | "DARK" | "BOTH";
export type CornerStyle = "SHARP" | "SUBTLE" | "ROUNDED" | "EXPRESSIVE";
export type InterfaceDensity = "COMPACT" | "COMFORTABLE" | "SPACIOUS";
export type BrandAssetKind = "LOGO_CARD" | "PRIMARY_LOGO" | "SECONDARY_LOGO" | "APP_ICON" | "BRAND_GUIDELINES";

export interface BrandAssetReference {
    readonly assetId: string;
    readonly kind: BrandAssetKind;
    readonly location: string;
    readonly mediaType?: string;
    readonly sha256?: string;
    readonly rightsConfirmed: boolean;
}

export interface BrandIntake {
    readonly personalities: readonly BrandPersonality[];
    readonly visualDirection: VisualDirection;
    readonly primaryColor?: string;
    readonly secondaryColor?: string;
    readonly accentColor?: string;
    readonly theme: ThemePreference;
    readonly cornerStyle: CornerStyle;
    readonly density: InterfaceDensity;
    readonly tagline?: string;
    readonly headingFont?: string;
    readonly bodyFont?: string;
    readonly usageGuidance?: string;
    readonly assets?: readonly BrandAssetReference[];
}

export interface SystemIntakeSubmission {
    readonly organizationName: string;
    readonly systemName: string;
    readonly mission: string;
    readonly users: readonly string[];
    readonly desiredOutcomes: readonly string[];
    readonly domain: DomainKind;
    readonly capabilities: readonly CapabilityKind[];
    readonly applicationStrategy: ApplicationStrategy;
    readonly existingRepository?: string;
    readonly autonomyMode: AuthorityMode;
    readonly businessOwner: string;
    readonly technicalOwner: string;
    readonly operatingRegions: readonly string[];
    readonly dataClassifications: readonly string[];
    readonly regulatoryFrameworks: readonly string[];
    readonly brand: BrandIntake;
}

export interface DesignTokens {
    readonly colors: Readonly<{
        primary: string;
        primaryHover: string;
        secondary: string;
        accent: string;
        background: string;
        surface: string;
        text: string;
        textMuted: string;
        border: string;
        success: string;
        warning: string;
        danger: string;
    }>;
    readonly typography: Readonly<{ heading: string; body: string }>;
    readonly radius: Readonly<{ small: string; medium: string; large: string }>;
    readonly spacingUnit: string;
    readonly density: InterfaceDensity;
    readonly themes: readonly ThemePreference[];
}

export interface DesignAccessibilityReport {
    readonly normalTextContrast: number;
    readonly largeTextContrast: number;
    readonly normalTextPass: boolean;
    readonly largeTextPass: boolean;
    readonly focusVisible: boolean;
    readonly semanticColorsDistinct: boolean;
    readonly passed: boolean;
    readonly remediations: readonly string[];
}

export interface SystemBlueprint {
    readonly blueprintId: string;
    readonly schemaVersion: "1.0.0";
    readonly status: "READY_FOR_APPROVAL" | "REVIEW_REQUIRED";
    readonly identity: Readonly<{
        organizationName: string;
        systemName: string;
        proposedSystemId: string;
        proposedOperatingSystemId: string;
    }>;
    readonly mission: string;
    readonly users: readonly string[];
    readonly desiredOutcomes: readonly string[];
    readonly foundation: Readonly<{ pbosVersion: "1.0.0"; domainPack: string; domainPackVersion: string }>;
    readonly capabilities: readonly CapabilityKind[];
    readonly application: Readonly<{ strategy: ApplicationStrategy; existingRepository?: string }>;
    readonly governance: Readonly<{
        autonomyMode: AuthorityMode;
        businessOwner: string;
        technicalOwner: string;
        protectedActions: readonly string[];
    }>;
    readonly dataPolicy: Readonly<{
        operatingRegions: readonly string[];
        classifications: readonly string[];
        regulatoryFrameworks: readonly string[];
    }>;
    readonly design: Readonly<{
        brand: BrandIntake;
        tokens: DesignTokens;
        accessibility: DesignAccessibilityReport;
    }>;
    readonly unresolvedDecisions: readonly string[];
    readonly createdAt: Date;
}
