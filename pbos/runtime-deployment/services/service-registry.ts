import { RuntimeServiceContract } from "./service-contract";

export class ServiceRegistry {
    private readonly services = new Map<string, RuntimeServiceContract>();

    register(service: RuntimeServiceContract): void {
        if (this.services.has(service.serviceId)) throw new Error(`Service already registered: ${service.serviceId}`);
        const missing = service.dependencyIds.filter(id => !this.services.get(id)?.active);
        if (missing.length > 0) throw new Error(`Service dependencies unavailable: ${missing.join(", ")}`);
        this.services.set(service.serviceId, service);
    }

    resolve(serviceId: string): RuntimeServiceContract | undefined {
        const service = this.services.get(serviceId);
        return service?.active ? service : undefined;
    }

    validate(requiredIds: readonly string[]): void {
        const missing = requiredIds.filter(id => !this.resolve(id));
        if (missing.length > 0) throw new Error(`Required runtime services unavailable: ${missing.join(", ")}`);
    }

    all(): readonly RuntimeServiceContract[] { return [...this.services.values()]; }
}
