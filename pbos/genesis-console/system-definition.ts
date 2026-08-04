export type GenesisSystemStatus = "REGISTERED" | "READY" | "ACTIVE" | "SUSPENDED";

export interface GenesisSystemDefinition {
    readonly systemId: string;
    readonly operatingSystemId: string;
    readonly name: string;
    readonly domain: string;
    readonly repository: string;
    readonly defaultBranch: string;
    readonly status: GenesisSystemStatus;
    readonly capabilities: readonly string[];
}

export const REFERENCE_SYSTEMS: readonly GenesisSystemDefinition[] = [
    {
        systemId: "PLAYBOOK-SYSTEM-001",
        operatingSystemId: "PLAYBOOK-OS-001",
        name: "Playbook Platform",
        domain: "Education",
        repository: "sgwalton87/playbook-platform",
        defaultBranch: "main",
        status: "READY",
        capabilities: ["WORKFLOWS", "ANALYTICS", "AUTOMATION"]
    },
    {
        systemId: "BULLETPROOF-SYSTEM-001",
        operatingSystemId: "BULLETPROOF-OS-001",
        name: "Bulletproof Beneficiary",
        domain: "Legacy Planning",
        repository: "vycoywalton/bulletproof-beneficiary-registry",
        defaultBranch: "main",
        status: "REGISTERED",
        capabilities: ["WORKFLOWS"]
    }
];
