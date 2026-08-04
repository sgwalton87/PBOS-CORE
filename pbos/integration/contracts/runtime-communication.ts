import { AuthorizationDecision } from "../../kernel";

export type RuntimeCommunicationType =
    | "LIFECYCLE_EVENT"
    | "HEALTH_CHECK"
    | "INTELLIGENCE_REQUEST"
    | "DATA_EXCHANGE";

export interface RuntimeCommunicationRequest<T = unknown> {
    readonly communicationId: string;
    readonly connectorId: string;
    readonly domainRegistrationId: string;
    readonly type: RuntimeCommunicationType;
    readonly actorId: string;
    readonly authority: AuthorizationDecision;
    readonly payload: T;
    readonly purpose: string;
    readonly dataClassification?: string;
    readonly exchangeApprovalId?: string;
    readonly correlationId: string;
    readonly provenance: readonly string[];
    readonly requestedAt: Date;
}

export interface RuntimeCommunicationResponse<T = unknown> {
    readonly communicationId: string;
    readonly correlationId: string;
    readonly type: RuntimeCommunicationType;
    readonly output: T;
    readonly provenance: readonly string[];
    readonly respondedAt: Date;
}
