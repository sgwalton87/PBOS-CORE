export interface PackageVersion {
    readonly version: string;
    readonly releaseId: string;
    readonly previousVersion?: string;
    readonly integrityDigest: string;
    readonly releasedAt: Date;
}
