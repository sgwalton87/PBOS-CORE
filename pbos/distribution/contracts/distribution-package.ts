import { PackageManifest } from "./package-manifest";
import { PackageVersion } from "./package-version";

export type PackageCertificationState = "DRAFT" | "CERTIFIED" | "REVOKED";

export interface DistributionPackage {
    readonly packageId: string;
    readonly name: string;
    readonly ownerId: string;
    readonly version: PackageVersion;
    readonly manifest: PackageManifest;
    readonly certificationState: PackageCertificationState;
    readonly payloadReference: string;
    readonly metadata: Readonly<Record<string, unknown>>;
}
