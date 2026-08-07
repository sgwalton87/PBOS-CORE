import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { AuthenticatedOperator, GenesisStateRepository, OperatorIdentityService, VerifiableApproval } from "../genesis-state";
import { TerminalIO } from "./terminal-io";

export interface FunctionalAcceptanceAuthorityDefinition {
    readonly missionId: string;
    readonly environmentVariable: string;
    readonly journey: string;
}

const playbookAuthorities: Readonly<Record<string, FunctionalAcceptanceAuthorityDefinition>> = {
    "048-opportunity-journey": { missionId: "048-opportunity-journey",
        environmentVariable: "PBOS_OPPORTUNITY_JOURNEY_APPROVAL_ID", journey: "readiness-to-opportunity" },
    "048-application-journey": { missionId: "048-application-journey",
        environmentVariable: "PBOS_APPLICATION_JOURNEY_APPROVAL_ID", journey: "opportunity-to-application" },
    "048-support-journey": { missionId: "048-support-journey",
        environmentVariable: "PBOS_SUPPORT_REQUEST_APPROVAL_ID", journey: "application-to-authorized-support" },
    "048-messaging-journey": { missionId: "048-messaging-journey",
        environmentVariable: "PBOS_MESSAGING_JOURNEY_APPROVAL_ID", journey: "authorized-support messaging" },
    "048-notification-journey": { missionId: "048-notification-journey",
        environmentVariable: "PBOS_NOTIFICATION_JOURNEY_APPROVAL_ID", journey: "event-to-acknowledged-notification" }
};

export function functionalAcceptanceAuthorityDefinition(missionId: string): FunctionalAcceptanceAuthorityDefinition | undefined {
    return playbookAuthorities[missionId];
}

export function functionalAcceptanceAuthorityDefinitions(): readonly FunctionalAcceptanceAuthorityDefinition[] {
    return Object.values(playbookAuthorities);
}

export function bindProtectedAcceptanceAuthority(path: string, name: string, approvalId: string): void {
    if (!/^PBOS_[A-Z0-9_]+_APPROVAL_ID$/.test(name) || !/^[a-f0-9-]{16,}$/i.test(approvalId)) {
        throw new Error("Protected acceptance authority binding requires an approved PBOS variable and signed approval ID.");
    }
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    let source = "";
    try { source = readFileSync(path, "utf8"); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const assignment = new RegExp(`^\\s*${name}\\s*=.*$`);
    const lines = source ? source.split(/\r?\n/).filter(line => !assignment.test(line)) : [];
    while (lines.at(-1) === "") lines.pop();
    lines.push(`${name}=${approvalId}`);
    const content = `${lines.join("\n")}\n`;
    writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
    chmodSync(path, 0o600);
}

export interface FunctionalAcceptanceAuthorityServices {
    readonly state: GenesisStateRepository;
    readonly identities: OperatorIdentityService;
    readonly operator: AuthenticatedOperator;
}

const action = "AUTHORIZE_FUNCTIONAL_ACCEPTANCE";

export async function ensureFunctionalAcceptanceAuthority(io: TerminalIO,
    services: FunctionalAcceptanceAuthorityServices, missionId: string, commit: string,
    protectedFile: string): Promise<VerifiableApproval | undefined> {
    const definition = functionalAcceptanceAuthorityDefinition(missionId);
    if (!definition) return undefined;
    if (!/^[a-f0-9]{7,40}$/i.test(commit)) throw new Error("Functional acceptance authority requires an exact repository revision.");
    const resource = `${missionId}:${commit}`;
    const existing = [...services.state.audit()].reverse().flatMap(event => {
        if (event.type !== "VERIFIABLE_APPROVAL" || event.resource !== resource ||
            event.evidence.purpose !== action) return [];
        const approval = event.evidence.approval as VerifiableApproval | undefined;
        return approval && services.identities.verify(approval, action, resource) ? [approval] : [];
    })[0];
    if (existing) {
        bindProtectedAcceptanceAuthority(protectedFile, definition.environmentVariable, existing.approvalId);
        return existing;
    }
    io.write("");
    io.write("PBOS FUNCTIONAL ACCEPTANCE AUTHORITY CHECKPOINT");
    io.write(`Journey: ${definition.journey}`);
    io.write(`Exact revision: ${commit}`);
    io.write("Scope: execute the synthetic staging journey, its owner-scoped writes, signed PBOS exchange, and browser evidence capture.");
    io.write("Production, merge, certification, secrets, destructive migration, and unrelated journeys remain excluded.");
    const response = (await io.prompt("Authorize this exact-revision functional acceptance now? [y/N] ")).trim().toLowerCase();
    if (response !== "y" && response !== "yes") {
        io.write("FUNCTIONAL ACCEPTANCE NOT AUTHORIZED");
        io.write("The existing mission, pull request, validation evidence, and repair budget remain unchanged.");
        return undefined;
    }
    const approval = services.identities.approve(services.operator, action, resource, 120);
    if (!services.identities.verify(approval, action, resource)) {
        throw new Error("Functional acceptance approval signature verification failed.");
    }
    services.state.appendAudit({ eventId: approval.approvalId, type: "VERIFIABLE_APPROVAL",
        actorId: services.operator.operatorId, resource, occurredAt: approval.issuedAt,
        evidence: { approval, purpose: action, missionId, commit,
            environmentVariable: definition.environmentVariable } });
    bindProtectedAcceptanceAuthority(protectedFile, definition.environmentVariable, approval.approvalId);
    io.write("FUNCTIONAL ACCEPTANCE AUTHORIZED");
    io.write(`Authority bound to ${definition.environmentVariable} in the protected mode-0600 PBOS source; its value was not displayed.`);
    return approval;
}
