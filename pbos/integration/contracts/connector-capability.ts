export type ConnectorCapabilityType = "SERVICE" | "WORKFLOW" | "INTELLIGENCE" | "ACTION";

export interface ConnectorCapability {
    readonly capabilityId: string;
    readonly name: string;
    readonly type: ConnectorCapabilityType;
    readonly version: string;
    readonly requiredPermissions: readonly string[];
    readonly inputSchemaId: string;
    readonly outputSchemaId: string;
    readonly active: boolean;
}
