import { describe, expect, it } from "vitest";
import {
    EvolutionApprovalManager, EvolutionChangeManager, EvolutionMetricsEngine,
    EvolutionObservationEngine, ImprovementDetector, ProposalGenerator
} from "../index";

function proposal() {
    const observation = new EvolutionObservationEngine().observe({
        systemId: "system", signalType: "PERFORMANCE", metric: "success-rate", value: 0.5,
        expectedRange: { minimum: 0.8, maximum: 1 }, provenance: ["runtime-event"]
    });
    const opportunities = new ImprovementDetector().detect([observation]);
    return new ProposalGenerator().generate(
        "system", opportunities, ["Improve governed workflow"], { successRate: 0.9 },
        ["Possible regression"], ["Restore version 1.0.0"]
    );
}

describe("PBOS Self-Evolution Architecture", () => {
    it("observes outcomes and detects evidence-backed opportunities", () => {
        const observation = new EvolutionObservationEngine().observe({
            systemId: "system", signalType: "HEALTH", metric: "availability", value: 0,
            expectedRange: { minimum: 1, maximum: 1 }, provenance: ["health-event"]
        });
        const opportunities = new ImprovementDetector().detect([observation]);
        expect(opportunities[0].category).toBe("FAILURE");
        expect(opportunities[0].observationIds).toEqual([observation.observationId]);
    });

    it("creates proposals with risks, provenance, and rollback plans", () => {
        const generated = proposal();
        expect(generated.status).toBe("PROPOSED");
        expect(generated.risks).toEqual(["Possible regression"]);
        expect(generated.rollbackPlan).toHaveLength(1);
    });

    it("requires governed human authority for approval", () => {
        const generated = proposal();
        const manager = new EvolutionApprovalManager();
        expect(() => manager.decide(generated, "reviewer", {
            allowed: false, actorId: "reviewer", action: "APPROVE_EVOLUTION", reason: "denied"
        }, "APPROVED", "rationale")).toThrow("governance boundary");
        const approval = manager.decide(generated, "reviewer", {
            allowed: true, actorId: "reviewer", action: "APPROVE_EVOLUTION", authorityId: "authority", reason: "permitted"
        }, "APPROVED", "Evidence and risk reviewed.");
        expect(approval.decision).toBe("APPROVED");
    });

    it("implements only approved changes and preserves version lineage", async () => {
        const generated = proposal();
        const approval = new EvolutionApprovalManager().decide(generated, "reviewer", {
            allowed: true, actorId: "reviewer", action: "APPROVE_EVOLUTION", authorityId: "authority", reason: "permitted"
        }, "APPROVED", "approved");
        const change = await new EvolutionChangeManager().implement(generated, approval, "1.0.0", "1.1.0", async () => undefined);
        expect(change.status).toBe("IMPLEMENTED");
        expect(change.lineage).toContain(approval.approvalId);
    });

    it("rolls back implemented changes through an explicit restore handler", async () => {
        const generated = proposal();
        const approval = new EvolutionApprovalManager().decide(generated, "reviewer", {
            allowed: true, actorId: "reviewer", action: "APPROVE_EVOLUTION", authorityId: "authority", reason: "permitted"
        }, "APPROVED", "approved");
        const manager = new EvolutionChangeManager();
        const change = await manager.implement(generated, approval, "1.0.0", "1.1.0", async () => undefined);
        expect((await manager.rollback(change, async () => undefined)).status).toBe("ROLLED_BACK");
    });

    it("measures impact and detects regression", () => {
        const metrics = new EvolutionMetricsEngine().measure("change", 0.8, 0.7, 0.1);
        expect(metrics.regression).toBe(true);
        expect(metrics.impact).toBeCloseTo(-0.1);
    });
});
