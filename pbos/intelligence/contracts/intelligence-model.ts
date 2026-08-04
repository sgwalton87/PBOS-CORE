export interface IntelligenceModel {
    readonly capabilityId: string;
    readonly name: string;
    readonly version: string;
    readonly requiredPermission: string;
    readonly supportedSourceTypes: readonly string[];
    readonly active: boolean;
    readonly metadata: Readonly<Record<string, unknown>>;
}
