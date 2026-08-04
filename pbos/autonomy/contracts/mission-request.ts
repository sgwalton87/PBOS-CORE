import { AuthorizationDecision } from "../../kernel";

export interface MissionRequest {
    readonly missionId: string;
    readonly systemId: string;
    readonly requestedBy: string;
    readonly objective: string;
    readonly context: Readonly<Record<string, unknown>>;
    readonly authority: AuthorizationDecision;
    readonly constraints: readonly string[];
    readonly expectedOutcome: Readonly<Record<string, unknown>>;
    readonly requestedAt: Date;
}
