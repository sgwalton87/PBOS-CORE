import { IntelligenceContext } from "./intelligence-context";

export interface IntelligenceRequest {
    readonly requestId: string;
    readonly capabilityId: string;
    readonly requestedBy: string;
    readonly purpose: string;
    readonly context: IntelligenceContext;
    readonly input: Readonly<Record<string, unknown>>;
    readonly requestedAt: Date;
}
