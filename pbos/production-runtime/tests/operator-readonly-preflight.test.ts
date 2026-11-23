import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { OperatorIdentityService } from "../../genesis-state";
import { compareReadOnlyStateDigests, inspectExistingOperatorRuntime } from "../operator-readonly-preflight";
import { ProductionRuntimeService } from "../production-runtime-service";

describe("read-only existing PBOS operator preflight", () => {
    it("does not create or bootstrap missing runtime files", () => {
        const directory = mkdtempSync(join(tmpdir(), "pbos-preflight-missing-"));
        const report = inspectExistingOperatorRuntime(directory);
        expect(report).toMatchObject({ status: "BLOCKED", operatorAuthenticated: false,
            missingFiles: ["profile.json", "operators.json", "genesis-state.json"], approvalGranted: false });
        expect(() => readFileSync(join(directory, "genesis-state.json"))).toThrow();
    });

    it("authenticates the original operator and leaves all existing files byte-identical", () => {
        const directory = mkdtempSync(join(tmpdir(), "pbos-preflight-operator-"));
        const enrollment = new OperatorIdentityService(join(directory, "operators.json"))
            .enroll("playbook-organization", "Founding Operator");
        const profilePath = join(directory, "profile.json");
        const statePath = join(directory, "genesis-state.json");
        writeFileSync(profilePath, JSON.stringify({ operatorId: enrollment.operator.operatorId,
            credential: enrollment.credential, organizationId: "playbook-organization" }), { mode: 0o600 });
        writeFileSync(statePath, JSON.stringify({ systems: [], blueprints: [], sessions: [],
            grants: [], audit: [] }), { mode: 0o600 });
        const paths = [profilePath, join(directory, "operators.json"), statePath];
        const before = paths.map(path => readFileSync(path));
        const report = inspectExistingOperatorRuntime(directory);
        expect(report).toMatchObject({ status: "INSPECTED", operatorAuthenticated: true,
            integrityValid: true, activeRuns: 0, activeLeases: 0, queuedMissions: 0,
            approvalGranted: false });
        expect(JSON.stringify(report)).not.toContain(enrollment.credential);
        expect(report.stateFilesUnchanged).toBe(true);
        expect(report.stateFingerprint).toBe(createHash("sha256").update(readFileSync(statePath)).digest("hex"));
        paths.forEach((path, index) => expect(readFileSync(path)).toEqual(before[index]));
    });

    it("blocks a changed state file instead of presenting an inspection as stable", () => {
        const first = ["a", "b", "c"];
        expect(compareReadOnlyStateDigests(first, ["a", "b", "c"])).toEqual({
            unchanged: true, stateFingerprint: "c"
        });
        expect(compareReadOnlyStateDigests(first, ["a", "changed", "c"])).toEqual({
            unchanged: false, stateFingerprint: null
        });
        expect(compareReadOnlyStateDigests(first, ["a", "b", "changed"])).toEqual({
            unchanged: false, stateFingerprint: null
        });
        expect(compareReadOnlyStateDigests(first, ["a", "b"])).toEqual({
            unchanged: false, stateFingerprint: null
        });
    });

    it("blocks invalid credentials without changing operator state", () => {
        const directory = mkdtempSync(join(tmpdir(), "pbos-preflight-invalid-"));
        const enrolled = new OperatorIdentityService(join(directory, "operators.json"))
            .enroll("playbook-organization", "Founding Operator");
        writeFileSync(join(directory, "profile.json"), JSON.stringify({
            operatorId: enrolled.operator.operatorId, credential: "incorrect-credential",
            organizationId: "playbook-organization" }));
        writeFileSync(join(directory, "genesis-state.json"), JSON.stringify({
            systems: [], blueprints: [], sessions: [], grants: [], audit: [] }));
        const path = join(directory, "operators.json");
        const before = readFileSync(path);
        expect(inspectExistingOperatorRuntime(directory)).toMatchObject({
            status: "BLOCKED", operatorAuthenticated: false, approvalGranted: false
        });
        expect(readFileSync(path)).toEqual(before);
    });

    it("blocks when the state changes during inspection", () => {
        const directory = mkdtempSync(join(tmpdir(), "pbos-probe-mutation-"));
        const { operator, credential } = new OperatorIdentityService(join(directory, "operators.json"))
            .enroll("stage", "Fixture");
        writeFileSync(join(directory, "profile.json"), JSON.stringify({ ...operator, credential }), { mode: 0o600 });
        const statePath = join(directory, "genesis-state.json");
        const state = JSON.stringify({ systems: [], blueprints: [], sessions: [], grants: [], audit: [] });
        writeFileSync(statePath, state, { mode: 0o600 });
        const verifyIntegrity = ProductionRuntimeService.prototype.verifyIntegrity;
        const change = vi.spyOn(ProductionRuntimeService.prototype, "verifyIntegrity").mockImplementationOnce(function (this: ProductionRuntimeService) {
            const result = verifyIntegrity.call(this);
            writeFileSync(statePath, state + "\n");
            return result;
        });
        try {
            expect(inspectExistingOperatorRuntime(directory)).toMatchObject({
                status: "BLOCKED", blocker: "STATE_CHANGED", stateFilesUnchanged: false,
                stateFingerprint: null, approvalGranted: false
            });
        } finally {
            change.mockRestore();
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
