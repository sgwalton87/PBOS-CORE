import { ScaffoldFile } from "../application-scaffold";
import { ApplicationJourney } from "../application-readiness";
import { BrandAssetReference, DesignTokens } from "../system-blueprint";

export type DeliveryTarget = "WEB" | "IOS" | "ANDROID";

export interface ApplicationDeliveryRequest {
    readonly systemId: string;
    readonly applicationName: string;
    readonly bundleNamespace: string;
    readonly universalLinkDomain: string;
    readonly targets: readonly DeliveryTarget[];
    readonly journeys?: readonly ApplicationJourney[];
    readonly designTokens?: DesignTokens;
    readonly brandAssets?: readonly BrandAssetReference[];
}

export interface ApplicationDeliveryBlueprint {
    readonly systemId: string;
    readonly targets: readonly DeliveryTarget[];
    readonly files: readonly ScaffoldFile[];
    readonly sharedBoundaries: readonly string[];
    readonly protectedReleaseActions: readonly string[];
    readonly storeRequirements: Readonly<Record<"IOS" | "ANDROID", readonly string[]>>;
}
