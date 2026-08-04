import { z } from "zod";
import { describe, expect, it } from "vitest";
import playbook from "./fixtures/playbook-runtime.json";
import bulletproof from "./fixtures/bulletproof-runtime.json";
import { PbosV1SchemaBoundary, RuntimeSchemaRegistry } from "../index";

describe("CIP-041 runtime schema compatibility", () => {
    it("validates Playbook and Bulletproof golden wire fixtures", () => {
        const boundary = new PbosV1SchemaBoundary();
        expect(boundary.validateOperation("REQUEST_INTELLIGENCE", playbook)).toEqual(playbook);
        expect(boundary.validateOperation("EXCHANGE_APPROVED_DATA", bulletproof)).toEqual(bulletproof);
    });

    it("rejects unknown authority and classification-shaping fields", () => {
        const boundary = new PbosV1SchemaBoundary();
        expect(() => boundary.validateOperation("SUSPEND_SYSTEM", {
            connectorId: "CONNECTOR-001", approvalId: "approval", actorId: "operator", reason: "test",
            allowed: true
        })).toThrow("Unrecognized key");
        expect(() => boundary.validateOperation("EXCHANGE_APPROVED_DATA", {
            ...bulletproof, classificationOverride: "PUBLIC"
        })).toThrow("Unrecognized key");
    });

    it("negotiates active compatible versions and fails closed after revocation", () => {
        const registry = new RuntimeSchemaRegistry();
        registry.register({ schemaId: "example.request", version: "1.0.0", owner: "PBOS-CORE", compatibility: "BACKWARD",
            status: "ACTIVE", schema: z.strictObject({ value: z.string() }) });
        registry.register({ schemaId: "example.request", version: "1.1.0", owner: "PBOS-CORE", compatibility: "BACKWARD",
            status: "ACTIVE", schema: z.strictObject({ value: z.string(), label: z.string().optional() }) });
        expect(registry.negotiate("example.request", ["1.0.0", "1.1.0"]).version).toBe("1.1.0");
        registry.revoke("example.request", "1.1.0");
        expect(registry.negotiate("example.request", ["1.0.0", "1.1.0"]).version).toBe("1.0.0");
        expect(() => registry.validate("example.request", "1.1.0", { value: "x" })).toThrow("unavailable");
    });

    it("enforces semantic versions, duplicate protection, and sunset ordering", () => {
        const registry = new RuntimeSchemaRegistry();
        const entry = { schemaId: "example.response", version: "1.0.0", owner: "PBOS-CORE", compatibility: "FULL" as const,
            status: "ACTIVE" as const, schema: z.strictObject({ accepted: z.boolean() }) };
        registry.register(entry);
        expect(() => registry.register(entry)).toThrow("already registered");
        expect(() => registry.deprecate(entry.schemaId, entry.version, new Date("2026-08-05"), new Date("2026-08-04")))
            .toThrow("later sunset");
    });
});
