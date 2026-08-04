import { RuntimeEnvironment, RuntimeEnvironmentType } from "../contracts/runtime-environment";

export class EnvironmentManager {
    private readonly environments = new Map<string, RuntimeEnvironment>();

    register(environment: RuntimeEnvironment): void {
        if (this.environments.has(environment.environmentId)) throw new Error(`Environment already registered: ${environment.environmentId}`);
        this.environments.set(environment.environmentId, environment);
    }

    get(environmentId: string): RuntimeEnvironment | undefined { return this.environments.get(environmentId); }

    forType(type: RuntimeEnvironmentType): readonly RuntimeEnvironment[] {
        return [...this.environments.values()].filter(environment => environment.type === type);
    }
}
