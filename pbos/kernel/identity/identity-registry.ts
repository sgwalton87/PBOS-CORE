import { ActorIdentity } from "./actor-identity";
import { SystemIdentity } from "./system-identity";

export class IdentityRegistry {
    private readonly systems = new Map<string, SystemIdentity>();
    private readonly actors = new Map<string, ActorIdentity>();

    registerSystem(identity: SystemIdentity): void {
        if (this.systems.has(identity.systemId)) {
            throw new Error(`System identity already registered: ${identity.systemId}`);
        }
        this.systems.set(identity.systemId, identity);
    }

    registerActor(identity: ActorIdentity): void {
        if (!this.systems.has(identity.systemId)) {
            throw new Error(`Actor system identity is not registered: ${identity.systemId}`);
        }
        if (this.actors.has(identity.actorId)) {
            throw new Error(`Actor identity already registered: ${identity.actorId}`);
        }
        this.actors.set(identity.actorId, identity);
    }

    getSystem(systemId: string): SystemIdentity | undefined {
        return this.systems.get(systemId);
    }

    getActor(actorId: string): ActorIdentity | undefined {
        return this.actors.get(actorId);
    }

    actorsForSystem(systemId: string): readonly ActorIdentity[] {
        return [...this.actors.values()].filter(actor => actor.systemId === systemId);
    }
}
