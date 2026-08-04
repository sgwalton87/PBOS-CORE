export interface PackageManifest {
    readonly packageId: string;
    readonly systemId: string;
    readonly ownerId: string;
    readonly version: string;
    readonly capabilityIds: readonly string[];
    readonly dependencyPackageIds: readonly string[];
    readonly provenance: readonly string[];
    readonly requiredPolicyIds: readonly string[];
    readonly createdAt: Date;
}
