export interface RuntimeServiceContract {
    readonly serviceId: string;
    readonly name: string;
    readonly version: string;
    readonly capability: string;
    readonly dependencyIds: readonly string[];
    readonly active: boolean;
}
