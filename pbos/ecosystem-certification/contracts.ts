export type CertifiedPlatform = "WEB" | "IOS" | "ANDROID";
export type PlatformReadinessDomain = "PRIVACY" | "IDENTITY" | "AUTHORITY" | "PROVENANCE" | "ACCESSIBILITY" | "SECURITY" | "OPERATIONAL" | "COMMERCIAL";

export interface PlatformEvidence {
    readonly evidenceId: string;
    readonly platform: CertifiedPlatform;
    readonly domain: PlatformReadinessDomain;
    readonly valid: boolean;
    readonly reference: string;
    readonly provenance: readonly string[];
}

export interface EcosystemSystemCandidate {
    readonly systemId: string;
    readonly applicationId: string;
    readonly repository: string;
    readonly revision: string;
    readonly brandId: string;
    readonly dataOwnershipBoundary: string;
    readonly releaseAuthority: string;
    readonly pbosContractVersion: string;
    readonly evidence: readonly PlatformEvidence[];
    readonly approvalIds: Readonly<Record<CertifiedPlatform, string | undefined>>;
    readonly approvalIssuers: Readonly<Record<CertifiedPlatform, string | undefined>>;
    readonly humanCertificationId?: string;
    readonly humanCertificationIssuer?: string;
    readonly externalReviewOutcomes: Readonly<Record<"APPLE" | "GOOGLE", string | undefined>>;
}

export interface PlatformCertificationResult {
    readonly platform: CertifiedPlatform;
    readonly ready: boolean;
    readonly score: number;
    readonly evidenceIds: readonly string[];
    readonly missingDomains: readonly PlatformReadinessDomain[];
    readonly approvalId?: string;
    readonly approvalIssuer?: string;
}

export interface EcosystemSystemCertificationResult {
    readonly systemId: string;
    readonly applicationId: string;
    readonly platforms: readonly PlatformCertificationResult[];
    readonly status: "NOT_READY" | "READY_FOR_HUMAN_CERTIFICATION" | "CERTIFIED";
    readonly humanCertificationId?: string;
    readonly humanCertificationIssuer?: string;
    readonly externalReviewOutcomes: Readonly<Record<"APPLE" | "GOOGLE", string | undefined>>;
}

export interface MultiPlatformEcosystemReport {
    readonly reportId: string;
    readonly systems: readonly EcosystemSystemCertificationResult[];
    readonly sharedContractVersion?: string;
    readonly independenceProven: boolean;
    readonly lineage: readonly string[];
    readonly status: "NOT_READY" | "READY_FOR_HUMAN_CERTIFICATION" | "CERTIFIED";
    readonly generatedAt: Date;
}
