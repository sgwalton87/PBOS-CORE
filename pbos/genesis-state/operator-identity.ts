import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { JsonStateStore } from "./json-state-store";

export interface OperatorIdentity {
    readonly operatorId: string;
    readonly organizationId: string;
    readonly displayName: string;
    readonly credentialHash: string;
    readonly signingKey: string;
    readonly active: boolean;
    readonly createdAt: string;
}

export interface AuthenticatedOperator {
    readonly operatorId: string;
    readonly organizationId: string;
    readonly displayName: string;
    readonly authenticatedAt: Date;
}

export interface VerifiableApproval {
    readonly approvalId: string;
    readonly operatorId: string;
    readonly organizationId: string;
    readonly action: string;
    readonly resource: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
    readonly signature: string;
}

interface OperatorState { readonly operators: readonly OperatorIdentity[]; }

export class OperatorIdentityService {
    private readonly state: JsonStateStore<OperatorState>;

    constructor(path: string) {
        this.state = new JsonStateStore(path, () => ({ operators: [] }));
    }

    enroll(organizationId: string, displayName: string, credential = randomBytes(32).toString("base64url")) {
        if (!organizationId.trim() || !displayName.trim() || credential.length < 16) {
            throw new Error("Operator enrollment requires organization, display name, and a strong credential.");
        }
        const identity: OperatorIdentity = {
            operatorId: randomUUID(), organizationId, displayName,
            credentialHash: this.hash(credential), signingKey: randomBytes(32).toString("base64url"),
            active: true, createdAt: new Date().toISOString()
        };
        this.state.update(current => ({ operators: [...current.operators, identity] }));
        return { operator: this.publicIdentity(identity), credential };
    }

    authenticate(operatorId: string, credential: string): AuthenticatedOperator {
        const identity = this.find(operatorId);
        const actual = Buffer.from(this.hash(credential));
        const expected = Buffer.from(identity.credentialHash);
        if (!identity.active || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
            throw new Error("Operator authentication failed.");
        }
        return { ...this.publicIdentity(identity), authenticatedAt: new Date() };
    }

    approve(operator: AuthenticatedOperator, action: string, resource: string, durationMinutes = 30): VerifiableApproval {
        const identity = this.find(operator.operatorId);
        if (identity.organizationId !== operator.organizationId || durationMinutes <= 0) throw new Error("Invalid approval authority.");
        const approval = {
            approvalId: randomUUID(), operatorId: identity.operatorId, organizationId: identity.organizationId,
            action, resource, issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + durationMinutes * 60_000).toISOString()
        };
        return { ...approval, signature: this.sign(identity.signingKey, approval) };
    }

    verify(approval: VerifiableApproval, action: string, resource: string, at = new Date()): boolean {
        const identity = this.find(approval.operatorId);
        if (!identity.active || approval.action !== action || approval.resource !== resource || new Date(approval.expiresAt) <= at) return false;
        const { signature, ...unsigned } = approval;
        const actual = Buffer.from(signature);
        const expected = Buffer.from(this.sign(identity.signingKey, unsigned));
        return actual.length === expected.length && timingSafeEqual(actual, expected);
    }

    private find(operatorId: string): OperatorIdentity {
        const identity = this.state.read().operators.find(candidate => candidate.operatorId === operatorId);
        if (!identity) throw new Error(`Operator not found: ${operatorId}`);
        return identity;
    }

    private publicIdentity(identity: OperatorIdentity) {
        return { operatorId: identity.operatorId, organizationId: identity.organizationId, displayName: identity.displayName };
    }

    private hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
    private sign(key: string, value: object): string {
        return createHmac("sha256", key).update(JSON.stringify(value)).digest("hex");
    }
}
