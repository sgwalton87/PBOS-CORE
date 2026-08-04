import { IntelligenceModel } from "../contracts/intelligence-model";

export class IntelligenceRegistry {
    private readonly capabilities = new Map<string, IntelligenceModel>();

    register(model: IntelligenceModel): void {
        const key = this.key(model.capabilityId, model.version);
        if (this.capabilities.has(key)) {
            throw new Error(`Intelligence capability version already registered: ${model.capabilityId}@${model.version}`);
        }
        this.capabilities.set(key, model);
    }

    resolve(capabilityId: string, version?: string): IntelligenceModel | undefined {
        if (version) {
            const capability = this.capabilities.get(this.key(capabilityId, version));
            return capability?.active ? capability : undefined;
        }
        return [...this.capabilities.values()]
            .filter(capability => capability.capabilityId === capabilityId && capability.active)
            .sort((left, right) => right.version.localeCompare(left.version))[0];
    }

    all(): readonly IntelligenceModel[] { return [...this.capabilities.values()]; }

    private key(capabilityId: string, version: string): string { return `${capabilityId}@${version}`; }
}
