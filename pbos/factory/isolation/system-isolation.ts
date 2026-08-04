export interface SystemIsolationContext {
    readonly systemId: string;
    readonly domainIds: readonly string[];
    readonly actorIds: readonly string[];
    readonly dataScopeIds: readonly string[];
}

export class SystemIsolation {
    assertAccess(
        source: SystemIsolationContext,
        target: SystemIsolationContext,
        actorId: string,
        dataScopeId?: string,
        domainId?: string
    ): void {
        if (source.systemId !== target.systemId) throw new Error("Cross-system access denied.");
        if (!source.actorIds.includes(actorId) || !target.actorIds.includes(actorId)) throw new Error("System actor access denied.");
        if (domainId && (!source.domainIds.includes(domainId) || !target.domainIds.includes(domainId))) {
            throw new Error("Cross-domain access denied.");
        }
        if (dataScopeId && (!source.dataScopeIds.includes(dataScopeId) || !target.dataScopeIds.includes(dataScopeId))) {
            throw new Error("Cross-system data access denied.");
        }
    }
}
