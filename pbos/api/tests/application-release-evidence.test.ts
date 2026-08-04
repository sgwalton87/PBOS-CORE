import { describe, expect, it } from "vitest";
import { ApplicationReleaseObservation, verifyApplicationRelease } from "../../tools/application-release-evidence";

const mobile = { artifactId: "artifact-1", physicalDevicePass: true, accessibilityPass: true,
    secureStoragePass: true, deepLinkPass: true, notificationConsentPass: true,
    privacyDisclosureApproved: true, internalDistributionPass: true, signingOwnerVerified: true };
const valid = (): ApplicationReleaseObservation => ({ repository: "sgwalton87/playbook-platform", revision: "aa94b6d",
    brandAssetIds: ["PLAYBOOK-LOGO-001"], designTokenSha256: "a".repeat(64),
    web: { stagingUrl: "https://staging.playbook.example", responsivePass: true, wcag22AaPass: true,
        securityPass: true, performancePass: true, stakeholderAcceptanceId: "ACCEPTANCE-001" },
    ios: { ...mobile, artifactId: "ios-1" }, android: { ...mobile, artifactId: "android-1" },
    crossPlatformJourneyParityPass: true, protectedStoreSubmissionNotPerformed: true,
    observedAt: "2026-08-04T23:00:00.000Z" });

describe("CIP-048 and CIP-049 application release evidence", () => {
    it("accepts web staging and both mobile internal release candidates", () => {
        expect(verifyApplicationRelease(valid())).toMatchObject({
            evidenceId: "PBOS-APPLICATION-RELEASE-AA94B6D-001", iosArtifactId: "ios-1", androidArtifactId: "android-1" });
    });

    it("rejects inaccessible web, insecure mobile, and premature store submission", () => {
        expect(() => verifyApplicationRelease({ ...valid(), web: { ...valid().web, wcag22AaPass: false } })).toThrow("CIP-048");
        expect(() => verifyApplicationRelease({ ...valid(), ios: { ...valid().ios, secureStoragePass: false } })).toThrow("iOS");
        expect(() => verifyApplicationRelease({ ...valid(), protectedStoreSubmissionNotPerformed: false })).toThrow("store submission");
    });
});
