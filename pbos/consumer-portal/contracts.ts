import type { ProductBrandSpec } from "../brand-system";

export interface PortalApplication {
    readonly systemId: string;
    readonly name: string;
    readonly description: string;
    readonly audience: string;
    readonly href: string;
    readonly brand: ProductBrandSpec;
}
export interface GenesisPortalModel {
    readonly title: string;
    readonly eyebrow: string;
    readonly summary: string;
    readonly primaryAction: { readonly label: string; readonly href: string };
    readonly secondaryAction: { readonly label: string; readonly href: string };
    readonly applications: readonly PortalApplication[];
}
