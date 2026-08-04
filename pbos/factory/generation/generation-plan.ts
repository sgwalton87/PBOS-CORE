export interface GenerationPlan {
    readonly generationId: string;
    readonly systemId: string;
    readonly systemName: string;
    readonly ownerId: string;
    readonly systemTemplateId: string;
    readonly domainTemplateIds: readonly string[];
    readonly steps: readonly string[];
    readonly status: "PLANNED";
    readonly createdAt: Date;
}

export interface GeneratedSystemDefinition {
    readonly systemId: string;
    readonly name: string;
    readonly version: string;
    readonly ownerId: string;
    readonly templateId: string;
    readonly domainIds: readonly string[];
    readonly sharedFoundation: {
        readonly kernelVersion: string;
        readonly runtimeVersion: string;
        readonly intelligenceVersion: string;
    };
    readonly lifecycle: "GENERATED";
    readonly generatedAt: Date;
}
