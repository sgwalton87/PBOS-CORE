export type BrandAssetRole = "MASTER_REFERENCE" | "HORIZONTAL_LOCKUP" | "STACKED_LOCKUP" | "MARK" | "APP_ICON";
export type BrandSurface = "GENESIS_CONSOLE" | "FACTORY_PORTAL" | "DOCUMENTATION" | "SOCIAL" | "APP_LAUNCHER";

export interface BrandColorToken {
    readonly name: string;
    readonly value: `#${string}`;
    readonly role: string;
}

export interface LogoAssetSpec {
    readonly assetId: string;
    readonly product: string;
    readonly role: BrandAssetRole;
    readonly sourcePath: string;
    readonly width: number;
    readonly height: number;
    readonly format: "PNG" | "SVG";
    readonly approvedSurfaces: readonly BrandSurface[];
    readonly minimumWidth: number;
    readonly clearSpaceRule: string;
    readonly backgroundRules: readonly string[];
}

export interface ProductBrandSpec {
    readonly brandId: string;
    readonly product: string;
    readonly tagline: string;
    readonly colors: readonly BrandColorToken[];
    readonly headingFont: string;
    readonly bodyFont: string;
    readonly asset: LogoAssetSpec;
    readonly logoAsset: LogoAssetSpec;
    readonly usageRules: readonly string[];
}
