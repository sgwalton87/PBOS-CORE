import { describe, expect, it } from "vitest";
import { loadProductionApprovalAuthority, type ProductionApprovalScope } from "../production-approval-authority";
import { cloudRunRuntimeConfig } from "../cloud-run-runtime";
import { PbosV1Api } from "../pbos-v1-api";
import { PbosV1SchemaBoundary, InMemoryIntegrationStateRepository } from "../../integration";
import { PLAYBOOK_CONNECTOR_MANIFEST, PLAYBOOK_DOMAIN_MANIFEST, playbookSupabaseIdentity } from "../../reference-systems";

const scope = {
    approvalId: "reviewed-fixture-reference", organizationId: "PLAYBOOK-ORG-001",
    connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId, registrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
    role: "SCHOLAR", operation: "REGISTER_IDENTITY",
} satisfies ProductionApprovalScope;
const approved = { ...scope, approvedBy: "INDEPENDENT-FIXTURE-AUTHORITY", status: "APPROVED",
    issuedAt: "2020-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" };
const exchange = { ...approved, approvalId: "reviewed-fixture-private-exchange",
    operation: "EXCHANGE_APPROVED_DATA" as const, classification: "PRIVATE" };

describe("production PBOS approval projection", () => {
    it("requires independently supplied records when production mode starts", () => {
        expect(() => cloudRunRuntimeConfig({ PBOS_ENVIRONMENT: "production", PBOS_ORGANIZATION_ID: "fixture",
            PBOS_INTEGRATION_STATE_PATH: "/unused", PBOS_CONNECTOR_TRUST_BUNDLE: '{"credentials":[{}]}' }))
            .toThrow(/scoped approval records/);
        expect(() => loadProductionApprovalAuthority([approved, approved])).toThrow(/uniquely identified/);
    });

    it("denies missing and incorrect scope, future, expired, and revoked records", () => {
        const authorize = loadProductionApprovalAuthority([approved, exchange]);
        expect(authorize(scope)).toBe(true);
        for (const mismatch of [{ approvalId: undefined }, { approvalId: "unknown" }, { organizationId: "other" },
            { registrationId: "other" }, { connectorId: "other" }, { role: "SCHOLAR_ATHLETE" },
            { operation: "EXCHANGE_APPROVED_DATA" as const }, { classification: "PRIVATE" }]) {
            expect(authorize({ ...scope, ...mismatch })).toBe(false);
        }
        expect(loadProductionApprovalAuthority([{ ...approved, status: "REVOKED" }])(scope)).toBe(false);
        expect(loadProductionApprovalAuthority([{ ...approved, expiresAt: "2021-01-01T00:00:00Z" }])(scope)).toBe(false);
        expect(loadProductionApprovalAuthority([{ ...approved, issuedAt: "2090-01-01T00:00:00Z" }])(scope)).toBe(false);
    });

    it("requires approval before mapping or exchange and rechecks before a cached result", async () => {
        const repository = new InMemoryIntegrationStateRepository();
        let allowExchange = true;
        const authorize = loadProductionApprovalAuthority([approved, exchange]);
        const api = new PbosV1Api(command => command.approvalId === "fixture-certification",
            command => command.approvalId === "fixture-domain-activation",
            (actorId, action) => ({ allowed: action === "EXCHANGE_APPROVED_DATA", actorId, action,
                authorityId: "fixture", reason: "Fixture exchange scope" }),
            repository, scope.organizationId, undefined,
            { DATA_EXCHANGE: async () => ({ accepted: true }) }, new PbosV1SchemaBoundary(),
            requested => (requested.operation !== "EXCHANGE_APPROVED_DATA" || allowExchange) && authorize(requested));
        const handle = (operation: Parameters<typeof api.handle>[0]["operation"], payload: unknown,
            connector = scope.connectorId, idempotencyKey?: string) =>
            api.handle({ apiVersion: "v1", operation, correlationId: "fixture-correlation", payload, idempotencyKey }, connector);
        for (const result of [
            await handle("REGISTER_SYSTEM", PLAYBOOK_CONNECTOR_MANIFEST),
            await handle("CERTIFY_SYSTEM", { connectorId: scope.connectorId, approvalId: "fixture-certification", certifiedBy: "fixture" }),
            await handle("REGISTER_DOMAIN", PLAYBOOK_DOMAIN_MANIFEST),
            await handle("ACTIVATE_DOMAIN", { registrationId: scope.registrationId, approvalId: "fixture-domain-activation" }),
        ]) expect(result.success).toBe(true);
        const identity = playbookSupabaseIdentity("fixture-scholar");
        const request = { ...identity, domainRegistrationId: scope.registrationId, identityApprovalId: scope.approvalId };
        await expect(handle("REGISTER_IDENTITY", identity)).resolves.toMatchObject({ success: false, error: { code: "AUTHORITY_DENIED" } });
        await expect(handle("REGISTER_IDENTITY", request, "other")).resolves.toMatchObject({ success: false, error: { code: "AUTHORITY_DENIED" } });
        expect(repository.identities(scope.organizationId)).toHaveLength(0);
        await expect(handle("REGISTER_IDENTITY", request)).resolves.toMatchObject({ success: true });
        expect(repository.identities(scope.organizationId)).toEqual([identity]);
        const projection = { connectorId: scope.connectorId, domainRegistrationId: scope.registrationId, identityMappingId: identity.mappingId,
            purpose: "Approved fixture projection", correlationId: "fixture-correlation", dataClassification: "PRIVATE",
            payload: { scholarRecordId: "fixture-scholar" } };
        await expect(handle("EXCHANGE_APPROVED_DATA", { ...projection, exchangeApprovalId: "unknown" })).resolves.toMatchObject({ success: false });
        const exchangePayload = { ...projection, exchangeApprovalId: exchange.approvalId };
        await expect(handle("EXCHANGE_APPROVED_DATA", { ...exchangePayload, payload: { scholarRecordId: "other-owner" } }))
            .resolves.toMatchObject({ success: false, error: { code: "AUTHORITY_DENIED" } });
        await expect(handle("EXCHANGE_APPROVED_DATA", exchangePayload, scope.connectorId, "fixture-key")).resolves.toMatchObject({ success: true });
        allowExchange = false;
        await expect(handle("EXCHANGE_APPROVED_DATA", exchangePayload, scope.connectorId, "fixture-key")).resolves.toMatchObject({ success: false });
    });
});
