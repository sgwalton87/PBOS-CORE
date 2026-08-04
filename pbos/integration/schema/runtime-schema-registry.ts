import { RegisteredRuntimeSchema, RuntimeSchemaDescriptor } from "./contracts";

export class RuntimeSchemaRegistry {
    private readonly schemas = new Map<string, RegisteredRuntimeSchema>();
    register(schema: RegisteredRuntimeSchema): void {
        if (!schema.schemaId || !/^\d+\.\d+\.\d+$/.test(schema.version) || !schema.owner) {
            throw new Error("Runtime schema requires identity, semantic version, and owner.");
        }
        const key = this.key(schema.schemaId, schema.version);
        if (this.schemas.has(key)) throw new Error(`Runtime schema already registered: ${key}`);
        this.schemas.set(key, schema);
    }
    descriptor(schemaId: string, version: string): RuntimeSchemaDescriptor | undefined {
        const value = this.schemas.get(this.key(schemaId, version));
        if (!value) return undefined;
        const { schema: _schema, ...descriptor } = value;
        return descriptor;
    }
    validate<T>(schemaId: string, version: string, value: unknown): T {
        const registered = this.schemas.get(this.key(schemaId, version));
        if (!registered || registered.status === "REVOKED") throw new Error(`Runtime schema unavailable: ${schemaId}@${version}`);
        if (registered.sunsetAt && registered.sunsetAt.getTime() <= Date.now()) throw new Error(`Runtime schema sunset reached: ${schemaId}@${version}`);
        const result = registered.schema.safeParse(value);
        if (!result.success) throw new Error(`Runtime schema validation failed: ${schemaId}@${version}: ${result.error.issues
            .map(issue => `${issue.path.join(".") || "payload"} ${issue.message}`).join("; ")}`);
        return result.data as T;
    }
    negotiate(schemaId: string, supportedVersions: readonly string[]): RuntimeSchemaDescriptor {
        const candidates = [...this.schemas.values()].filter(item => item.schemaId === schemaId && item.status === "ACTIVE" &&
            supportedVersions.includes(item.version) && (!item.sunsetAt || item.sunsetAt.getTime() > Date.now()));
        candidates.sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true }));
        if (!candidates[0]) throw new Error(`No compatible runtime schema version: ${schemaId}`);
        return this.descriptor(candidates[0].schemaId, candidates[0].version)!;
    }
    deprecate(schemaId: string, version: string, deprecatedAt: Date, sunsetAt: Date): void {
        const key = this.key(schemaId, version);
        const current = this.schemas.get(key);
        if (!current || sunsetAt.getTime() <= deprecatedAt.getTime()) throw new Error("Schema deprecation requires an existing schema and later sunset.");
        this.schemas.set(key, { ...current, status: "DEPRECATED", deprecatedAt, sunsetAt });
    }
    revoke(schemaId: string, version: string): void {
        const key = this.key(schemaId, version);
        const current = this.schemas.get(key);
        if (!current) throw new Error(`Runtime schema unavailable: ${key}`);
        this.schemas.set(key, { ...current, status: "REVOKED" });
    }
    private key(schemaId: string, version: string): string { return `${schemaId}@${version}`; }
}
