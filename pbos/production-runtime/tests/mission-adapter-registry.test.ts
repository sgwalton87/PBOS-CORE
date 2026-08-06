import { describe, expect, it } from "vitest";
import { MissionQueueItem, ProductionMissionAdapterRegistry } from "../index";

const mission = (missionId: string): MissionQueueItem => ({ missionId, systemId: "PLAYBOOK-SYSTEM-001", title: missionId,
    dependencies: [], status: "ELIGIBLE", rationale: "Ready", approvalRequired: false, evidenceIds: [] });

describe("production mission adapter registry", () => {
    it("resolves only adapters registered for the selected system and reports launch coverage", () => {
        const executor = async () => ({ outputs: {}, evidenceIds: [], validations: [] });
        const registry = new ProductionMissionAdapterRegistry()
            .register("PLAYBOOK-SYSTEM-001", "048-foundation", () => executor);
        expect(registry.resolve(mission("048-foundation"))).toBe(executor);
        expect(registry.resolve(mission("048-scholar-slice"))).toBeUndefined();
        expect(registry.coverage([mission("048-foundation"), mission("048-scholar-slice")]))
            .toEqual({ registered: ["048-foundation"], missing: ["048-scholar-slice"] });
    });

    it("rejects ambiguous duplicate registrations", () => {
        const registry = new ProductionMissionAdapterRegistry().register("S", "M", () => async () => ({ outputs: {}, evidenceIds: [], validations: [] }));
        expect(() => registry.register("S", "M", () => async () => ({ outputs: {}, evidenceIds: [], validations: [] })))
            .toThrow("already registered");
    });

    it("does not expose a functional mission adapter unless it declares executable acceptance", () => {
        const functional = { ...mission("048-scholar-slice"), completionPolicy: {
            kind: "FUNCTIONAL_APPLICATION" as const, requiredDimensions: ["ROUTE" as const], acceptanceCriteria: ["launches"]
        } };
        const executor = async () => ({ outputs: {}, evidenceIds: [], validations: [] });
        const unproven = new ProductionMissionAdapterRegistry()
            .register("PLAYBOOK-SYSTEM-001", "048-scholar-slice", () => executor);
        expect(unproven.resolve(functional)).toBeUndefined();
        expect(unproven.coverage([functional]).missing).toEqual(["048-scholar-slice"]);
        const executable = new ProductionMissionAdapterRegistry()
            .register("PLAYBOOK-SYSTEM-001", "048-scholar-slice", () => executor,
                { producesFunctionalAcceptancePlan: true });
        expect(executable.resolve(functional)).toBe(executor);
    });
});
