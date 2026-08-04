import { randomUUID } from "crypto";
import { AuthorizationDecision } from "../../kernel";
import { DistributionPackage } from "../contracts/distribution-package";
import { LicenseContract } from "../licensing/license-contract";

export interface DistributionDeployment {
    readonly distributionDeploymentId: string;
    readonly packageId: string;
    readonly packageVersion: string;
    readonly organizationId: string;
    readonly licenseId: string;
    readonly lineage: readonly string[];
    readonly status: "DELIVERED";
    readonly deliveredAt: Date;
}

export class DistributionDeployer {
    deploy(
        pkg: DistributionPackage,
        license: LicenseContract,
        organizationId: string,
        authority: AuthorizationDecision,
        verifyIntegrity: (digest: string, payloadReference: string) => boolean
    ): DistributionDeployment {
        if (pkg.certificationState !== "CERTIFIED") throw new Error("Only certified packages may be distributed.");
        if (!authority.allowed || authority.action !== "DISTRIBUTE_PACKAGE") throw new Error("Package distribution denied by authority boundary.");
        if (license.packageId !== pkg.packageId || license.packageVersion !== pkg.version.version || license.licenseeId !== organizationId) {
            throw new Error("Distribution license does not match package or organization.");
        }
        const now = new Date();
        if (!license.active || license.startsAt > now || (license.expiresAt !== undefined && license.expiresAt <= now) ||
            !license.permissions.includes("DEPLOY")) throw new Error("Distribution license is not active or lacks deployment permission.");
        if (!pkg.manifest.requiredPolicyIds.every(policy => license.policyIds.includes(policy))) {
            throw new Error("Distribution policy requirements not satisfied.");
        }
        if (!verifyIntegrity(pkg.version.integrityDigest, pkg.payloadReference)) throw new Error("Package integrity verification failed.");
        return {
            distributionDeploymentId: randomUUID(), packageId: pkg.packageId,
            packageVersion: pkg.version.version, organizationId, licenseId: license.licenseId,
            lineage: [...pkg.manifest.provenance, pkg.version.releaseId], status: "DELIVERED", deliveredAt: new Date()
        };
    }
}
