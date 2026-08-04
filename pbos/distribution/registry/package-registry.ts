import { DistributionPackage } from "../contracts/distribution-package";

export class PackageRegistry {
    private readonly packages = new Map<string, DistributionPackage>();
    register(pkg: DistributionPackage): void {
        const key = this.key(pkg.packageId, pkg.version.version);
        if (this.packages.has(key)) throw new Error(`Package version already registered: ${key}`);
        if (pkg.manifest.packageId !== pkg.packageId || pkg.manifest.ownerId !== pkg.ownerId || pkg.manifest.version !== pkg.version.version) {
            throw new Error("Package manifest identity mismatch.");
        }
        this.packages.set(key, pkg);
    }
    get(packageId: string, version: string): DistributionPackage | undefined { return this.packages.get(this.key(packageId, version)); }
    versions(packageId: string): readonly DistributionPackage[] {
        return [...this.packages.values()].filter(pkg => pkg.packageId === packageId)
            .sort((left, right) => left.version.version.localeCompare(right.version.version));
    }
    validateDependencies(pkg: DistributionPackage): void {
        const available = new Set([...this.packages.values()].map(candidate => candidate.packageId));
        const missing = pkg.manifest.dependencyPackageIds.filter(packageId => !available.has(packageId));
        if (missing.length > 0) throw new Error(`Distribution package dependencies unavailable: ${missing.join(", ")}`);
    }
    private key(packageId: string, version: string): string { return `${packageId}@${version}`; }
}
