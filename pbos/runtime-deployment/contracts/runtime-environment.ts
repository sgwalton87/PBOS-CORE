export type RuntimeEnvironmentType = "DEVELOPMENT" | "VALIDATION" | "PRODUCTION";

export interface RuntimeEnvironment {
    readonly environmentId: string;
    readonly type: RuntimeEnvironmentType;
    readonly configuration: Readonly<Record<string, unknown>>;
    readonly createdAt: Date;
}
