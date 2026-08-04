import { randomUUID } from "crypto";
import { BeneficiarySearchRequest, DomainAuthorityRule, LegacyPlanningEvent, LegacyPlanningRole, SearchStatus } from "./contracts";

const TRANSITIONS: Readonly<Record<SearchStatus, readonly SearchStatus[]>> = {
    DRAFT: ["SUBMITTED"], SUBMITTED: ["IN_REVIEW"], IN_REVIEW: ["MATCH_FOUND", "NO_MATCH"],
    MATCH_FOUND: ["CLOSED"], NO_MATCH: ["CLOSED"], CLOSED: []
};

export const LEGACY_PLANNING_AUTHORITY: readonly DomainAuthorityRule[] = [
    { role: "MEMBER", capability: "ACCOUNT_IDENTITY", actions: ["CREATE", "READ_OWN", "UPDATE_OWN"], humanApprovalRequired: false },
    { role: "MEMBER", capability: "BENEFICIARY_SEARCH", actions: ["CREATE", "READ_OWN"], humanApprovalRequired: false },
    { role: "MEMBER", capability: "SECURE_DOCUMENT", actions: ["CREATE", "READ_OWN"], humanApprovalRequired: false },
    { role: "VERIFIER", capability: "IDENTITY_VERIFICATION", actions: ["READ_AUTHORIZED", "VERIFY"], humanApprovalRequired: true },
    { role: "SYSTEM_OPERATOR", capability: "SEARCH_TRACKING", actions: ["READ_AUTHORIZED", "ADMINISTER"], humanApprovalRequired: true }
];

export class LegacyPlanningRuntime {
    createSearch(memberId: string, beneficiaryName: string, relationship: string, evidenceId: string): BeneficiarySearchRequest {
        if (![memberId, beneficiaryName, relationship, evidenceId].every(value => value.trim())) throw new Error("Beneficiary search requires identity, subject, relationship, and evidence.");
        return { requestId: randomUUID(), memberId, beneficiaryName, relationship, status: "DRAFT", provenance: [evidenceId] };
    }

    transition(search: BeneficiarySearchRequest, next: SearchStatus, actorId: string, approvalId?: string) {
        if (!TRANSITIONS[search.status].includes(next)) throw new Error(`Invalid beneficiary search transition: ${search.status} -> ${next}`);
        if (["IN_REVIEW", "MATCH_FOUND", "NO_MATCH", "CLOSED"].includes(next) && !approvalId) throw new Error("Governed search transition requires explicit approval.");
        const updated: BeneficiarySearchRequest = { ...search, status: next,
            submittedAt: next === "SUBMITTED" ? new Date() : search.submittedAt,
            provenance: [...search.provenance, ...(approvalId ? [approvalId] : [])] };
        const event: LegacyPlanningEvent = { eventId: randomUUID(), systemId: "PBOS-V1", actorId, subjectId: search.requestId,
            type: `BENEFICIARY_SEARCH_${next}`, occurredAt: new Date(), provenance: [...updated.provenance] };
        return { search: updated, event };
    }

    authorize(role: LegacyPlanningRole, capability: DomainAuthorityRule["capability"], action: DomainAuthorityRule["actions"][number], approvalId?: string): boolean {
        const rule = LEGACY_PLANNING_AUTHORITY.find(candidate => candidate.role === role && candidate.capability === capability && candidate.actions.includes(action));
        return Boolean(rule && (!rule.humanApprovalRequired || approvalId));
    }
}
