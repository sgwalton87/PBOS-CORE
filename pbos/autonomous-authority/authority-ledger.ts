import { BuildAuthorityDecision, BuildAuthorityRequest } from "./contracts";

export interface AuthorityAuditRecord {
    readonly request: BuildAuthorityRequest;
    readonly decision: BuildAuthorityDecision;
}

export class AuthorityLedger {
    private readonly records: AuthorityAuditRecord[] = [];

    record(request: BuildAuthorityRequest, decision: BuildAuthorityDecision): void {
        this.records.push({ request, decision });
    }

    forGrant(grantId: string): readonly AuthorityAuditRecord[] {
        return this.records.filter(record => record.decision.grantId === grantId);
    }
}
