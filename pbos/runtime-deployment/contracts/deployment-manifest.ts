export interface DeploymentManifest {
    readonly manifestId: string;
    readonly compiledArtifactId: string;
    readonly targetSystemId: string;
    readonly schemaVersion: string;
    readonly environmentId: string;
    readonly domainIds: readonly string[];
    readonly requiredServiceIds: readonly string[];
    readonly lineage: readonly string[];
    readonly createdAt: Date;
}
