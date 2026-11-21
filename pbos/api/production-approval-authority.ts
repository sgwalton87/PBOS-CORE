import { z } from "zod";

const identifier = z.string().trim().min(1);
const grant = z.strictObject({
    approvalId: identifier,
    organizationId: identifier,
    connectorId: identifier,
    registrationId: identifier,
    role: identifier,
    operation: z.enum(["REGISTER_IDENTITY", "EXCHANGE_APPROVED_DATA"]),
    classification: identifier.optional(),
    approvedBy: identifier,
    status: z.enum(["APPROVED", "REVOKED"]),
    issuedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
}).refine(record => (record.operation === "EXCHANGE_APPROVED_DATA") === Boolean(record.classification) &&
    Date.parse(record.issuedAt) < Date.parse(record.expiresAt));

export type ProductionApprovalScope = {
    approvalId?: string;
    organizationId: string;
    connectorId: string;
    registrationId: string;
    role: string;
    operation: "REGISTER_IDENTITY" | "EXCHANGE_APPROVED_DATA";
    classification?: string;
};

export type ProductionApprovalAuthority = (scope: ProductionApprovalScope) => boolean;

/** This is a deployment-owned projection of independent governance decisions.
 * Connector requests can reference grants but have no write access to this source.
 */
export function loadProductionApprovalAuthority(records: unknown): ProductionApprovalAuthority {
    const parsed = z.array(grant).min(1).safeParse(records);
    if (!parsed.success || new Set(parsed.data.map(record => record.approvalId)).size !== parsed.data.length) {
        throw new Error("Production PBOS requires valid, uniquely identified scoped approval records.");
    }
    const byId = new Map(parsed.data.map(record => [record.approvalId, record]));
    return scope => {
        const record = scope.approvalId ? byId.get(scope.approvalId) : undefined;
        const now = Date.now();
        return Boolean(record && record.status === "APPROVED" &&
            Date.parse(record.issuedAt) <= now && now < Date.parse(record.expiresAt) &&
            record.organizationId === scope.organizationId && record.connectorId === scope.connectorId &&
            record.registrationId === scope.registrationId && record.role === scope.role &&
            record.operation === scope.operation && record.classification === scope.classification);
    };
}
