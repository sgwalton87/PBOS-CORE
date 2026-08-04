export type ApplicationSurface = "WEB" | "IOS" | "ANDROID";
export type ApplicationJourney = "IDENTITY_ONBOARDING" | "DASHBOARD" | "ACADEMIC" | "OPPORTUNITY" | "APPLICATIONS" | "SUPPORT_NETWORK" | "MESSAGING" | "DOCUMENTS" | "NOTIFICATIONS";

export interface JourneyEvidence {
    readonly journey: ApplicationJourney;
    readonly surface: ApplicationSurface;
    readonly implementationPaths: readonly string[];
    readonly testPaths: readonly string[];
    readonly usesDurableData: boolean;
    readonly authorityAndProvenance: boolean;
    readonly responsive: boolean;
    readonly accessible: boolean;
}

export interface ApplicationRepositoryInventory {
    readonly repository: string;
    readonly revision: string;
    readonly branch: string;
    readonly routeCount: number;
    readonly testCount: number;
    readonly databaseFileCount: number;
    readonly units: readonly Readonly<{ unitId: string; paths: readonly string[]; journeys: readonly ApplicationJourney[] }>[];
    readonly evidence: readonly JourneyEvidence[];
}

export interface ApplicationReadinessGap {
    readonly gapId: string;
    readonly cip: "CIP-048" | "CIP-049";
    readonly journey: ApplicationJourney;
    readonly surface: ApplicationSurface;
    readonly priority: "CRITICAL" | "HIGH" | "NORMAL";
    readonly missing: readonly string[];
    readonly acceptanceCriteria: readonly string[];
}

export interface ApplicationReadinessReport {
    readonly repository: string;
    readonly revision: string;
    readonly inventory: Readonly<{ routes: number; tests: number; databaseFiles: number }>;
    readonly gaps: readonly ApplicationReadinessGap[];
    readonly unmappedUnits: readonly string[];
    readonly complete: boolean;
    readonly generatedAt: Date;
}
