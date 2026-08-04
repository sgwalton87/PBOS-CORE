export interface DomainTemplate {
    readonly domainTemplateId: string;
    readonly name: string;
    readonly classification: string;
    readonly version: string;
    readonly capabilityIds: readonly string[];
    readonly requiredServiceIds: readonly string[];
    readonly metadata: Readonly<Record<string, unknown>>;
}
