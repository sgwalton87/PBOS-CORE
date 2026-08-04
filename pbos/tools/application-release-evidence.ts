import { readFileSync } from "node:fs";

interface MobileReleaseObservation {
    readonly artifactId: string;
    readonly physicalDevicePass: boolean;
    readonly accessibilityPass: boolean;
    readonly secureStoragePass: boolean;
    readonly deepLinkPass: boolean;
    readonly notificationConsentPass: boolean;
    readonly privacyDisclosureApproved: boolean;
    readonly internalDistributionPass: boolean;
    readonly signingOwnerVerified: boolean;
}

export interface ApplicationReleaseObservation {
    readonly repository: string;
    readonly revision: string;
    readonly brandAssetIds: readonly string[];
    readonly designTokenSha256: string;
    readonly web: Readonly<{
        stagingUrl: string;
        responsivePass: boolean;
        wcag22AaPass: boolean;
        securityPass: boolean;
        performancePass: boolean;
        stakeholderAcceptanceId: string;
    }>;
    readonly ios: MobileReleaseObservation;
    readonly android: MobileReleaseObservation;
    readonly crossPlatformJourneyParityPass: boolean;
    readonly protectedStoreSubmissionNotPerformed: boolean;
    readonly observedAt: string;
}

const sha256 = /^[a-f0-9]{64}$/i;

export function verifyApplicationRelease(observation: ApplicationReleaseObservation): unknown {
    if (!observation.repository.includes("/") || !/^[a-f0-9]{7,40}$/i.test(observation.revision)) {
        throw new Error("Release evidence requires an exact application repository revision.");
    }
    if (observation.brandAssetIds.length === 0 || !sha256.test(observation.designTokenSha256)) {
        throw new Error("Release evidence requires approved brand assets and immutable design tokens.");
    }
    if (!observation.web.stagingUrl.startsWith("https://") || !observation.web.stakeholderAcceptanceId.trim()
        || !observation.web.responsivePass || !observation.web.wcag22AaPass
        || !observation.web.securityPass || !observation.web.performancePass) {
        throw new Error("CIP-048 web staging acceptance evidence is incomplete.");
    }
    for (const [platform, mobile] of [["iOS", observation.ios], ["Android", observation.android]] as const) {
        if (!mobile.artifactId.trim() || !mobile.physicalDevicePass || !mobile.accessibilityPass || !mobile.secureStoragePass
            || !mobile.deepLinkPass || !mobile.notificationConsentPass || !mobile.privacyDisclosureApproved
            || !mobile.internalDistributionPass || !mobile.signingOwnerVerified) {
            throw new Error(`CIP-049 ${platform} release-candidate evidence is incomplete.`);
        }
    }
    if (!observation.crossPlatformJourneyParityPass) throw new Error("Cross-platform journey parity is not proven.");
    if (!observation.protectedStoreSubmissionNotPerformed) {
        throw new Error("Evidence preparation must stop before protected store submission.");
    }
    if (Number.isNaN(Date.parse(observation.observedAt))) throw new Error("Release evidence requires a valid observation timestamp.");
    return { evidenceId: `PBOS-APPLICATION-RELEASE-${observation.revision.toUpperCase()}-001`,
        repository: observation.repository, revision: observation.revision,
        webStagingUrl: observation.web.stagingUrl, iosArtifactId: observation.ios.artifactId,
        androidArtifactId: observation.android.artifactId, brandAssetIds: observation.brandAssetIds,
        designTokenSha256: observation.designTokenSha256, observedAt: observation.observedAt };
}

export function verifyApplicationReleaseFile(path = process.env.PBOS_APPLICATION_RELEASE_EVIDENCE_PATH?.trim()): unknown {
    if (!path) throw new Error("Required application release evidence path is missing: PBOS_APPLICATION_RELEASE_EVIDENCE_PATH");
    return verifyApplicationRelease(JSON.parse(readFileSync(path, "utf8")) as ApplicationReleaseObservation);
}

if (require.main === module) {
    try { process.stdout.write(`${JSON.stringify(verifyApplicationReleaseFile(), null, 2)}\n`); }
    catch (error) {
        process.stderr.write(`Application release evidence failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
