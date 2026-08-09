type JsonRecord = Record<string, unknown>;

function parseManifest(source: string, errorMessage: string): JsonRecord {
    try {
        const parsed = JSON.parse(source) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Manifest must be an object.");
        return parsed as JsonRecord;
    } catch {
        throw new Error(errorMessage);
    }
}

function nonEmptyStringArray(value: unknown): readonly string[] | undefined {
    return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string" && item.trim())
        ? value as readonly string[]
        : undefined;
}

export function readPlaybookProductManifest(source: string): Readonly<{
    canonicalGraphRevision: string;
    journeyIds: readonly string[];
}> {
    const errorMessage = "Connected Playbook product acceptance is not present on the governed default branch.";
    const manifest = parseManifest(source, errorMessage);
    const journeyIds = nonEmptyStringArray(manifest.journeyIds);
    const journeys = Array.isArray(manifest.journeys)
        ? manifest.journeys.filter(item => item && typeof item === "object" && typeof (item as JsonRecord).journeyId === "string")
        : [];
    if (manifest.state !== "IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION" ||
        typeof manifest.canonicalGraphRevision !== "string" || !manifest.canonicalGraphRevision.trim() ||
        !journeyIds || journeys.length !== journeyIds.length) {
        throw new Error(errorMessage);
    }
    return { canonicalGraphRevision: manifest.canonicalGraphRevision, journeyIds };
}

export function readPlaybookMobileFoundationManifest(source: string): Readonly<{
    productCanonicalGraphRevision: string;
    productJourneyIds: readonly string[];
}> {
    const errorMessage = "Validated mobile foundation evidence is required before native journey implementation.";
    const manifest = parseManifest(source, errorMessage);
    const targets = nonEmptyStringArray(manifest.targets);
    const productJourneyIds = nonEmptyStringArray(manifest.productJourneyIds);
    if (manifest.state !== "IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION" ||
        typeof manifest.productCanonicalGraphRevision !== "string" || !manifest.productCanonicalGraphRevision.trim() ||
        !targets?.includes("IOS") || !targets.includes("ANDROID") || !productJourneyIds) {
        throw new Error(errorMessage);
    }
    return { productCanonicalGraphRevision: manifest.productCanonicalGraphRevision, productJourneyIds };
}

export function readPlaybookMobileJourneysManifest(source: string): Readonly<{
    productCanonicalGraphRevision: string;
    platforms: readonly string[];
    productJourneyIds: readonly string[];
}> {
    const errorMessage = "Validated iOS and Android journey evidence is required before store readiness.";
    const manifest = parseManifest(source, errorMessage);
    const platforms = nonEmptyStringArray(manifest.platforms);
    const productJourneyIds = nonEmptyStringArray(manifest.productJourneyIds);
    if (manifest.state !== "IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION" ||
        typeof manifest.productCanonicalGraphRevision !== "string" || !manifest.productCanonicalGraphRevision.trim() ||
        !platforms?.includes("IOS") || !platforms.includes("ANDROID") || !productJourneyIds) {
        throw new Error(errorMessage);
    }
    return { productCanonicalGraphRevision: manifest.productCanonicalGraphRevision, platforms, productJourneyIds };
}

export function readPlaybookMobileStoreReadinessManifest(source: string): Readonly<{
    productCanonicalGraphRevision: string;
    productJourneyIds: readonly string[];
    storeDistribution: readonly string[];
}> {
    const errorMessage = "The merged store-readiness manifest is required before mobile final certification.";
    const manifest = parseManifest(source, errorMessage);
    const productJourneyIds = nonEmptyStringArray(manifest.productJourneyIds);
    const storeDistribution = nonEmptyStringArray(manifest.storeDistribution);
    if (manifest.missionId !== "049-store-readiness" ||
        typeof manifest.productCanonicalGraphRevision !== "string" || !manifest.productCanonicalGraphRevision.trim() ||
        !productJourneyIds || !storeDistribution?.includes("TESTFLIGHT") || !storeDistribution.includes("GOOGLE_PLAY_INTERNAL")) {
        throw new Error(errorMessage);
    }
    return { productCanonicalGraphRevision: manifest.productCanonicalGraphRevision, productJourneyIds, storeDistribution };
}
