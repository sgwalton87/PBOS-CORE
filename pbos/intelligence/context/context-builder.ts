import { randomUUID } from "crypto";
import { RuntimeInstance } from "../../runtime-deployment";
import { AuthorizationDecision } from "../../kernel";
import { IntelligenceContext, IntelligenceSource } from "../contracts/intelligence-context";
import { ContextRegistry } from "./context-registry";

export class ContextBuilder {
    constructor(private readonly registry = new ContextRegistry()) {}

    build(
        instance: RuntimeInstance,
        actorId: string,
        sources: readonly IntelligenceSource[],
        authority: AuthorizationDecision
    ): IntelligenceContext {
        if (instance.lifecycleState !== "ACTIVE") throw new Error("Intelligence requires an active runtime instance.");
        if (!authority.allowed || authority.actorId !== actorId) {
            throw new Error("Intelligence context denied by authority boundary.");
        }
        const unapproved = sources.filter(source => !source.approved);
        if (unapproved.length > 0) throw new Error("Intelligence context contains unapproved sources.");
        const context = {
            contextId: randomUUID(),
            instanceId: instance.instanceId,
            systemId: instance.systemId,
            actorId,
            sources: [...sources],
            provenance: [...new Set(sources.flatMap(source => source.provenance))],
            createdAt: new Date()
        };
        this.registry.register(context);
        return context;
    }
}
