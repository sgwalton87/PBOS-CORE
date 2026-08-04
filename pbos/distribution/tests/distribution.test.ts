import { describe, expect, it } from "vitest";
import {
    DistributionDeployer, DistributionPackage, EcosystemRegistry,
    LicenseContract, LicenseManager, PackageRegistry
} from "../index";

const pkg: DistributionPackage = {
    packageId: "package", name: "System Package", ownerId: "owner",
    version: { version: "1.0.0", releaseId: "release", integrityDigest: "digest", releasedAt: new Date() },
    manifest: {
        packageId: "package", systemId: "system", ownerId: "owner", version: "1.0.0",
        capabilityIds: ["capability"], dependencyPackageIds: [], provenance: ["system"],
        requiredPolicyIds: ["policy"], createdAt: new Date()
    },
    certificationState: "CERTIFIED", payloadReference: "payload", metadata: {}
};
const license: LicenseContract = {
    licenseId: "license", packageId: "package", packageVersion: "1.0.0", licenseeId: "organization",
    usageRights: ["USE"], permissions: ["DEPLOY"], startsAt: new Date(0), active: true, policyIds: ["policy"]
};

describe("PBOS Distribution and Ecosystem Architecture", () => {
    it("registers immutable package versions and ownership", () => {
        const registry = new PackageRegistry();
        registry.register(pkg);
        expect(registry.get("package", "1.0.0")?.ownerId).toBe("owner");
        expect(() => registry.register(pkg)).toThrow("already registered");
    });

    it("fails closed for missing, expired, or unauthorized licenses", () => {
        const licenses = new LicenseManager();
        licenses.register(license);
        expect(licenses.authorize("license", "package", "1.0.0", "DEPLOY").licenseeId).toBe("organization");
        expect(() => licenses.authorize("unknown", "package", "1.0.0", "DEPLOY")).toThrow("denied");
        licenses.register({ ...license, licenseId: "expired", expiresAt: new Date(1) });
        expect(() => licenses.authorize("expired", "package", "1.0.0", "DEPLOY")).toThrow("denied");
    });

    it("delivers certified, licensed, governed packages with lineage", () => {
        const deployment = new DistributionDeployer().deploy(pkg, license, "organization", {
            allowed: true, actorId: "operator", action: "DISTRIBUTE_PACKAGE", authorityId: "authority", reason: "permitted"
        }, (digest, payload) => digest === "digest" && payload === "payload");
        expect(deployment.status).toBe("DELIVERED");
        expect(deployment.lineage).toEqual(["system", "release"]);
    });

    it("rejects uncertified, corrupt, or unauthorized distribution", () => {
        const authority = { allowed: true, actorId: "operator", action: "DISTRIBUTE_PACKAGE", authorityId: "authority", reason: "permitted" };
        expect(() => new DistributionDeployer().deploy({ ...pkg, certificationState: "DRAFT" }, license, "organization", authority, () => true))
            .toThrow("certified packages");
        expect(() => new DistributionDeployer().deploy(pkg, license, "organization", authority, () => false))
            .toThrow("integrity verification failed");
    });

    it("tracks ecosystem ownership and deployed systems", () => {
        const ecosystem = new EcosystemRegistry();
        ecosystem.register({ organizationId: "organization", name: "Organization", ownerIds: ["owner"], relatedOrganizationIds: [], deployedSystemIds: [] });
        expect(ecosystem.recordDeployment("organization", "system").deployedSystemIds).toEqual(["system"]);
    });
});
