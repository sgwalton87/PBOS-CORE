import { ConnectorCapability } from "./connector-capability";

export type ConnectorStatus = "REGISTERED" | "ACTIVE" | "SUSPENDED" | "DISCONNECTED" | "FAILED";
export type ConnectorCertification = "PENDING" | "CERTIFIED" | "REVOKED";

export interface SystemConnector {
    readonly connectorId: string;
    readonly externalSystemId: string;
    readonly pbosSystemId: string;
    readonly name: string;
    readonly version: string;
    readonly domainIds: readonly string[];
    readonly capabilities: readonly ConnectorCapability[];
    readonly permissions: readonly string[];
    readonly communicationRules: readonly string[];
    readonly status: ConnectorStatus;
    readonly certification: ConnectorCertification;
    readonly registeredAt: Date;
}
