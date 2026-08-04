import { ScaffoldFile } from "../application-scaffold";

export type DeliveryTarget = "WEB" | "IOS" | "ANDROID";

export interface ApplicationDeliveryRequest {
    readonly systemId: string;
    readonly applicationName: string;
    readonly bundleNamespace: string;
    readonly universalLinkDomain: string;
    readonly targets: readonly DeliveryTarget[];
}

export interface ApplicationDeliveryBlueprint {
    readonly systemId: string;
    readonly targets: readonly DeliveryTarget[];
    readonly files: readonly ScaffoldFile[];
    readonly sharedBoundaries: readonly string[];
    readonly protectedReleaseActions: readonly string[];
    readonly storeRequirements: Readonly<Record<"IOS" | "ANDROID", readonly string[]>>;
}
