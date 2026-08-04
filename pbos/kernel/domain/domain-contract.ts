export interface DomainContract {
    readonly domainId: string;
    readonly name: string;
    readonly classification: string;
    readonly version: string;
    readonly systemIds: readonly string[];
    readonly metadata: Readonly<Record<string, unknown>>;
}
