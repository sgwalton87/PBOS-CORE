import { randomUUID } from "crypto";
import { AuthorityMode } from "../autonomous-authority";
import { ConnectorRegistrationManifest, DomainRegistrationManifest } from "../connector-sdk";

export interface GenesisBuildTarget {
    readonly systemId: string;
    readonly operatingSystemId: string;
    readonly repository: string;
    readonly defaultBranch: string;
}

export interface GenesisPbosBuildChannelRequest {
    readonly target: GenesisBuildTarget;
    readonly session: Readonly<{ sessionId: string; systemId: string; repository: string }>;
    readonly grant: Readonly<{ grantId: string; systemId: string; repository: string; mode: AuthorityMode }>;
    readonly connector: ConnectorRegistrationManifest;
    readonly domains: readonly DomainRegistrationManifest[];
}

export interface GenesisPbosBuildChannelContract {
    readonly channelId: string;
    readonly factory: "PBOS_GENESIS";
    readonly runtime: "PBOS_V1";
    readonly systemId: string;
    readonly operatingSystemId: string;
    readonly connectorId: string;
    readonly domainRegistrationIds: readonly string[];
    readonly repository: string;
    readonly defaultBranch: string;
    readonly sessionId: string;
    readonly grantId: string;
    readonly authorityMode: Exclude<AuthorityMode, "READ_ONLY">;
    readonly capabilityIds: readonly string[];
    readonly communicationRules: readonly string[];
    readonly openedAt: string;
}

/**
 * The governed articulation point between the Genesis factory, PBOS v1, and an
 * independently owned application repository. It validates identity and
 * capability wiring before any production mission may mutate application code.
 */
export class GenesisPbosBuildChannel {
    open(request: GenesisPbosBuildChannelRequest): GenesisPbosBuildChannelContract {
        const { target, connector, domains } = request;
        const authorityMode = request.grant.mode;
        if (authorityMode === "READ_ONLY") throw new Error("Application builds require Human-Gated or Delegated Autonomous authority.");
        if (!request.session.sessionId || !request.grant.grantId) throw new Error("Genesis build channel requires a durable session and grant.");
        if (request.session.systemId !== target.systemId || request.grant.systemId !== target.systemId ||
            request.session.repository !== target.repository || request.grant.repository !== target.repository) {
            throw new Error("Genesis session or authority grant is crossed with another application boundary.");
        }
        if (connector.externalSystemId !== target.systemId || connector.pbosSystemId !== target.operatingSystemId) {
            throw new Error("PBOS connector identity does not match the selected Genesis system and PBOS v1 instance.");
        }
        if (!target.repository.includes("/") || !target.defaultBranch) throw new Error("Build target requires a governed repository boundary.");
        if (domains.length === 0) throw new Error("PBOS build channel requires at least one registered domain contract.");
        const declaredDomains = new Set(connector.domainIds);
        const capabilityIds = new Set(connector.capabilities.filter(item => item.active).map(item => item.capabilityId));
        for (const domain of domains) {
            if (domain.connectorId !== connector.connectorId || domain.externalSystemId !== target.systemId ||
                domain.pbosSystemId !== target.operatingSystemId || !declaredDomains.has(domain.domainId)) {
                throw new Error(`PBOS domain ${domain.registrationId} does not belong to the selected build channel.`);
            }
            for (const capabilityId of domain.capabilityIds) {
                if (!capabilityIds.has(capabilityId)) throw new Error(`PBOS domain requires undeclared active capability: ${capabilityId}`);
            }
        }
        if (capabilityIds.size === 0) throw new Error("PBOS build channel requires active connector capabilities.");
        return {
            channelId: randomUUID(), factory: "PBOS_GENESIS", runtime: "PBOS_V1",
            systemId: target.systemId, operatingSystemId: target.operatingSystemId,
            connectorId: connector.connectorId, domainRegistrationIds: domains.map(item => item.registrationId),
            repository: target.repository, defaultBranch: target.defaultBranch,
            sessionId: request.session.sessionId, grantId: request.grant.grantId, authorityMode,
            capabilityIds: [...capabilityIds].sort(), communicationRules: [...connector.communicationRules],
            openedAt: new Date().toISOString()
        };
    }
}
