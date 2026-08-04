import { z } from "zod";
import type { PbosApiOperation } from "../../connector-sdk";
import { RuntimeSchemaRegistry } from "./runtime-schema-registry";

const nonempty = z.string().min(1);
const connectorStatus = z.strictObject({ connectorId: nonempty });
const lifecycle = connectorStatus.extend({ approvalId: nonempty, actorId: nonempty, reason: nonempty });
const domainStatus = z.strictObject({ registrationId: nonempty });
const domainLifecycle = domainStatus.extend({ approvalId: nonempty, actorId: nonempty, reason: nonempty });
const runtime = z.strictObject({ connectorId: nonempty, domainRegistrationId: nonempty, identityMappingId: nonempty,
    purpose: nonempty, correlationId: nonempty, payload: z.unknown(), dataClassification: nonempty.optional(),
    exchangeApprovalId: nonempty.optional() });
const capability = z.strictObject({ capabilityId: nonempty, name: nonempty,
    type: z.enum(["SERVICE", "WORKFLOW", "INTELLIGENCE", "ACTION"]), version: nonempty,
    requiredPermissions: z.array(nonempty), inputSchemaId: nonempty, outputSchemaId: nonempty, active: z.boolean() });

const operationSchemas: Readonly<Partial<Record<PbosApiOperation, z.ZodType>>> = {
    REGISTER_SYSTEM: z.strictObject({ connectorId: nonempty, externalSystemId: nonempty, pbosSystemId: nonempty,
        name: nonempty, version: nonempty, domainIds: z.array(nonempty).min(1), capabilities: z.array(capability).min(1),
        permissions: z.array(nonempty), communicationRules: z.array(nonempty) }),
    CERTIFY_SYSTEM: z.strictObject({ connectorId: nonempty, approvalId: nonempty, certifiedBy: nonempty }),
    REGISTER_DOMAIN: z.strictObject({ registrationId: nonempty, connectorId: nonempty, externalSystemId: nonempty,
        pbosSystemId: nonempty, domainId: nonempty, capabilityIds: z.array(nonempty).min(1), workflowIds: z.array(nonempty),
        requiredServiceIds: z.array(nonempty), governanceRequirementIds: z.array(nonempty).min(1) }),
    ACTIVATE_DOMAIN: z.strictObject({ registrationId: nonempty, approvalId: nonempty }),
    REGISTER_IDENTITY: z.strictObject({ mappingId: nonempty,
        externalIdentity: z.strictObject({ externalIdentityId: nonempty, externalSystemId: nonempty, role: nonempty,
            authorityReferences: z.array(nonempty), active: z.boolean() }),
        pbosIdentity: z.strictObject({ actorId: nonempty, systemId: nonempty, role: nonempty,
            authorityContext: z.array(nonempty), provenance: nonempty, active: z.boolean() }), mappedAt: z.coerce.date() }),
    HEALTH_CHECK: z.strictObject({ connectorId: nonempty, domainRegistrationId: nonempty, identityMappingId: nonempty,
        purpose: nonempty, correlationId: nonempty }),
    GET_CONNECTOR_STATUS: connectorStatus,
    SUSPEND_SYSTEM: lifecycle,
    RESUME_SYSTEM: lifecycle,
    REVOKE_SYSTEM: lifecycle,
    NEGOTIATE_VERSION: connectorStatus.extend({ supportedVersions: z.array(nonempty).min(1) }),
    GET_DOMAIN_STATUS: domainStatus,
    DEACTIVATE_DOMAIN: domainLifecycle,
    DISCOVER_CAPABILITIES: connectorStatus.extend({ grantedPermissions: z.array(nonempty) }),
    PUBLISH_LIFECYCLE_EVENT: runtime,
    REQUEST_INTELLIGENCE: runtime,
    EXCHANGE_APPROVED_DATA: runtime,
    QUERY_AUDIT: connectorStatus.extend({ correlationId: nonempty.optional(), limit: z.number().int().min(1).max(500).optional() })
};

export class PbosV1SchemaBoundary {
    readonly registry = new RuntimeSchemaRegistry();
    constructor() {
        for (const [operation, schema] of Object.entries(operationSchemas)) this.registry.register({
            schemaId: `pbos.operation.${operation.toLowerCase()}`, version: "1.0.0", owner: "PBOS-CORE",
            compatibility: "BACKWARD", status: "ACTIVE", schema
        });
    }
    validateOperation<T>(operation: PbosApiOperation, payload: unknown): T {
        const schema = operationSchemas[operation];
        return schema ? this.registry.validate<T>(`pbos.operation.${operation.toLowerCase()}`, "1.0.0", payload) : payload as T;
    }
}
