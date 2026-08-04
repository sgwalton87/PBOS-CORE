export interface PreferenceModel {
    readonly actorId: string;
    readonly explicitPreferences: Readonly<Record<string, unknown>>;
    readonly allowedPreferenceKeys: readonly string[];
    readonly consentGranted: boolean;
    readonly recordedAt: Date;
    readonly provenance: string;
}

export interface PersonalizationResult {
    readonly applied: Readonly<Record<string, unknown>>;
    readonly ignoredKeys: readonly string[];
    readonly explanation: readonly string[];
}
