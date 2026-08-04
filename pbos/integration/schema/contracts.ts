import { z } from "zod";

export type SchemaCompatibility = "BACKWARD" | "FORWARD" | "FULL" | "NONE";
export type RuntimeSchemaStatus = "ACTIVE" | "DEPRECATED" | "REVOKED";

export interface RuntimeSchemaDescriptor {
    readonly schemaId: string;
    readonly version: string;
    readonly owner: string;
    readonly compatibility: SchemaCompatibility;
    readonly status: RuntimeSchemaStatus;
    readonly deprecatedAt?: Date;
    readonly sunsetAt?: Date;
}

export interface RegisteredRuntimeSchema extends RuntimeSchemaDescriptor { readonly schema: z.ZodType; }
