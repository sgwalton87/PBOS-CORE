export interface LicenseContract {
    readonly licenseId: string;
    readonly packageId: string;
    readonly packageVersion: string;
    readonly licenseeId: string;
    readonly usageRights: readonly string[];
    readonly permissions: readonly string[];
    readonly startsAt: Date;
    readonly expiresAt?: Date;
    readonly active: boolean;
    readonly policyIds: readonly string[];
}
