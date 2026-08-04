import { AuthorizationDecision } from "../../kernel";

export interface IntegrationRequest<T = unknown> {
    readonly requestId: string;
    readonly connectorId: string;
    readonly capabilityId: string;
    readonly actorId: string;
    readonly authority: AuthorizationDecision;
    readonly payload: T;
    readonly correlationId: string;
    readonly provenance: readonly string[];
    readonly requestedAt: Date;
}
