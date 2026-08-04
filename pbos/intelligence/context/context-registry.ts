import { IntelligenceContext } from "../contracts/intelligence-context";

export class ContextRegistry {
    private readonly contexts = new Map<string, IntelligenceContext>();

    register(context: IntelligenceContext): void {
        if (this.contexts.has(context.contextId)) throw new Error(`Intelligence context already registered: ${context.contextId}`);
        this.contexts.set(context.contextId, context);
    }

    get(contextId: string): IntelligenceContext | undefined { return this.contexts.get(contextId); }
    forInstance(instanceId: string): readonly IntelligenceContext[] {
        return [...this.contexts.values()].filter(context => context.instanceId === instanceId);
    }
}
