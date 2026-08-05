import { existsSync, mkdtempSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { BuildAuthorityService } from "../../autonomous-authority";
import { GenesisStateRepository, JsonStateStore, OperatorIdentityService, PersistentAuthorityLedger, PersistentBuildGrantRegistry } from "../index";

describe("durable Genesis state and operator identity", () => {
    it("authenticates operators and detects approval tampering", () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-identity-")), "operators.json");
        const service = new OperatorIdentityService(path);
        const enrolled = service.enroll("ORG-001", "Viveca", "a-secure-operator-credential");
        const operator = service.authenticate(enrolled.operator.operatorId, enrolled.credential);
        const approval = service.approve(operator, "ISSUE_BUILD_GRANT", "BULLETPROOF-SYSTEM-001");
        expect(service.verify(approval, "ISSUE_BUILD_GRANT", "BULLETPROOF-SYSTEM-001")).toBe(true);
        expect(service.verify({ ...approval, resource: "PLAYBOOK-SYSTEM-001" }, "ISSUE_BUILD_GRANT", "PLAYBOOK-SYSTEM-001")).toBe(false);
    });

    it("observes grant revocation across authority-service processes", () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-state-")), "state.json");
        const stateA = new GenesisStateRepository(path);
        const serviceA = new BuildAuthorityService(new PersistentBuildGrantRegistry(stateA), new PersistentAuthorityLedger(stateA));
        const grant = serviceA.issue({ systemId: "BULLETPROOF-SYSTEM-001", repository: "vycoywalton/bulletproof-beneficiary-registry",
            branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY", allowedActions: ["INSPECT_REPOSITORY"], maximumRisk: "LOW",
            issuedBy: "operator", issuanceApprovalId: "signed-approval", durationMinutes: 60 });
        const serviceB = new BuildAuthorityService(new PersistentBuildGrantRegistry(new GenesisStateRepository(path)), new PersistentAuthorityLedger(new GenesisStateRepository(path)));
        serviceA.revoke(grant.grantId, "Operator revoked cross-process grant.");
        expect(serviceB.authorize({ grantId: grant.grantId, systemId: grant.systemId, repository: grant.repository,
            branch: "agent/audit", action: "INSPECT_REPOSITORY", risk: "LOW", requestedAt: new Date() }).allowed).toBe(false);
    });

    it("recovers a stale state lock before applying an atomic update", () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-state-lock-")), "state.json");
        const lock = `${path}.lock`;
        writeFileSync(lock, "orphaned\n");
        const old = new Date(Date.now() - 31_000); utimesSync(lock, old, old);
        const store = new JsonStateStore(path, () => ({ count: 0 }));
        expect(store.update(current => ({ count: current.count + 1 }))).toEqual({ count: 1 });
        expect(existsSync(lock)).toBe(false);
    });
});
