import { describe, expect, it } from "vitest";
import { CANONICAL_DISTRIBUTED_PLATFORM_NODES, DistributedPlatformGraph,
    DistributedPlatformNodeId, PlatformValidationEvidence } from "../index";

const evidence = (nodeId: DistributedPlatformNodeId, health: PlatformValidationEvidence["health"] = "HEALTHY") => ({
    nodeId, health, checkedAt: "2026-08-06T00:00:00.000Z", source: "test", detail: `${nodeId} ${health}`
} as const);

describe("PBS-6000 distributed platform graph", () => {
    it("preserves one acyclic canonical graph and the constitutional production ordering", () => {
        const graph = new DistributedPlatformGraph();
        expect(() => graph.assertTopology()).not.toThrow();
        const order = graph.order("PRODUCTION_RELEASE");
        expect(order.indexOf("CONSTITUTION")).toBeLessThan(order.indexOf("SOURCE_CONTROL"));
        expect(order.indexOf("SOURCE_CONTROL")).toBeLessThan(order.indexOf("BUILD_OS"));
        expect(order.indexOf("DATA_PLATFORM")).toBeLessThan(order.indexOf("CLOUD_IDENTITY"));
        expect(order.indexOf("CLOUD_IDENTITY")).toBeLessThan(order.indexOf("DEPLOYMENT"));
        expect(order.indexOf("DEPLOYMENT")).toBeLessThan(order.indexOf("DOMAIN_DNS"));
        expect(order.indexOf("CLIENT")).toBeLessThan(order.indexOf("PRODUCT"));
    });

    it("does not require production deployment and DNS to prove a local functional journey", () => {
        const graph = new DistributedPlatformGraph();
        const order = graph.order("FUNCTIONAL_ACCEPTANCE");
        expect(order).not.toContain("DEPLOYMENT");
        expect(order).not.toContain("DOMAIN_DNS");
        const report = graph.evaluate("FUNCTIONAL_ACCEPTANCE", order.map(nodeId => evidence(nodeId)));
        expect(report.health).toBe("HEALTHY");
    });

    it("blocks production when any required platform lacks truthful health evidence", () => {
        const graph = new DistributedPlatformGraph();
        const proof = graph.order("PRODUCTION_RELEASE").filter(nodeId => nodeId !== "DEPLOYMENT").map(nodeId => evidence(nodeId));
        const report = graph.evaluate("PRODUCTION_RELEASE", proof);
        expect(report.health).toBe("BLOCKED");
        expect(report.blockers).toContain("DEPLOYMENT: no current validation evidence");
    });

    it("requires declared providers without making every optional provider universal", () => {
        const graph = new DistributedPlatformGraph();
        expect(graph.order("PRODUCTION_RELEASE")).not.toContain("AI_PROVIDERS");
        expect(graph.order("PRODUCTION_RELEASE", ["AI_PROVIDERS"])).toContain("AI_PROVIDERS");
    });

    it("rejects a duplicate source of platform truth", () => {
        const graph = new DistributedPlatformGraph([...CANONICAL_DISTRIBUTED_PLATFORM_NODES,
            CANONICAL_DISTRIBUTED_PLATFORM_NODES[0]]);
        expect(() => graph.assertTopology()).toThrow("missing or duplicate canonical nodes");
    });
});
