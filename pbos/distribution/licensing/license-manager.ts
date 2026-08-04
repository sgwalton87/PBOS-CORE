import { LicenseContract } from "./license-contract";

export class LicenseManager {
    private readonly licenses = new Map<string, LicenseContract>();
    register(license: LicenseContract): void {
        if (this.licenses.has(license.licenseId)) throw new Error(`License already registered: ${license.licenseId}`);
        this.licenses.set(license.licenseId, license);
    }
    authorize(licenseId: string, packageId: string, version: string, permission: string, at = new Date()): LicenseContract {
        const license = this.licenses.get(licenseId);
        if (!license || !license.active || license.packageId !== packageId || license.packageVersion !== version ||
            license.startsAt > at || (license.expiresAt !== undefined && license.expiresAt <= at) ||
            !license.permissions.includes(permission)) {
            throw new Error("Package use denied by license boundary.");
        }
        return license;
    }
}
