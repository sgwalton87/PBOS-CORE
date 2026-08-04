export interface SystemTemplate {
    readonly systemTemplateId: string;
    readonly name: string;
    readonly version: string;
    readonly kernelVersion: string;
    readonly runtimeVersion: string;
    readonly intelligenceVersion: string;
    readonly allowedDomainTemplateIds: readonly string[];
    readonly requiredPolicyIds: readonly string[];
    readonly metadata: Readonly<Record<string, unknown>>;
}
