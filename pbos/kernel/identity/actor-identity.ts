export interface ActorIdentity {
    readonly actorId: string;
    readonly systemId: string;
    readonly role: string;
    readonly authorityContext: readonly string[];
    readonly provenance: string;
    readonly active: boolean;
}
