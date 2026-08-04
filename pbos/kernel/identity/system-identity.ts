export interface SystemIdentity {
    readonly systemId: string;
    readonly systemName: string;
    readonly version: string;
    readonly lineage: readonly string[];
    readonly domainClassification: readonly string[];
}
