import { existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
    CircuitBreaker, ConcurrencyBulkhead, FileDeliveryRepository, InMemoryDeliveryRepository, ReliableDeliveryEngine
} from "../index";

const policy = { maximumAttempts: 3, initialDelayMs: 10, maximumDelayMs: 100, jitterRatio: 0, timeoutMs: 100 };

describe("CIP-042 reliable delivery", () => {
    it("retries bounded transient failures and delivers exactly once after restart", async () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-delivery-")), "delivery.json");
        const delays: number[] = [];
        const engine = new ReliableDeliveryEngine(new FileDeliveryRepository(path), policy, new CircuitBreaker(5),
            new ConcurrencyBulkhead(2), () => "RETRYABLE", () => 0.5, async delay => { delays.push(delay); });
        const queued = engine.enqueue("ORG-001", "CONNECTOR-001", "DATA_EXCHANGE", "exchange-1", { value: 1 });
        expect(existsSync(`${path}.lock`)).toBe(false);
        let calls = 0;
        const delivered = await engine.deliver(queued.deliveryId, async () => { calls += 1; if (calls < 3) throw new Error("temporary"); });
        expect(delivered).toMatchObject({ state: "DELIVERED", attempts: 3 });
        expect(delays).toEqual([10, 20]);
        const restarted = new ReliableDeliveryEngine(new FileDeliveryRepository(path), policy);
        await restarted.deliver(queued.deliveryId, async () => { calls += 1; });
        expect(calls).toBe(3);
    });

    it("dead-letters terminal failures and requires governed replay", async () => {
        const repository = new InMemoryDeliveryRepository();
        const engine = new ReliableDeliveryEngine(repository, policy, new CircuitBreaker(5), new ConcurrencyBulkhead(1),
            () => "TERMINAL");
        const queued = engine.enqueue("ORG-001", "CONNECTOR-001", "INTELLIGENCE", "intel-1", {});
        expect(await engine.deliver(queued.deliveryId, async () => { throw new Error("invalid payload"); }))
            .toMatchObject({ state: "DEAD_LETTER", attempts: 1 });
        expect(() => engine.replay(queued.deliveryId, "self", "application", () => false)).toThrow("governance");
        expect(engine.replay(queued.deliveryId, "approval-1", "operator-1", (_record, approval) => approval === "approval-1").state)
            .toBe("PENDING");
    });

    it("times out stalled dependencies and reports degraded health", async () => {
        const repository = new InMemoryDeliveryRepository();
        const engine = new ReliableDeliveryEngine(repository, { ...policy, maximumAttempts: 1, timeoutMs: 5 });
        const queued = engine.enqueue("ORG-001", "CONNECTOR-001", "HEALTH", "health-1", {});
        const result = await engine.deliver(queued.deliveryId, async () => new Promise(() => undefined));
        expect(result.lastError).toContain("timed out");
        expect(engine.health("ORG-001")).toMatchObject({ state: "DEGRADED", deadLetters: 1 });
    });

    it("opens circuits and rejects bulkhead overflow", async () => {
        const circuit = new CircuitBreaker(1, 60_000);
        circuit.failure(1);
        expect(() => circuit.assertAvailable(2)).toThrow("circuit is open");
        const bulkhead = new ConcurrencyBulkhead(1);
        let release!: () => void;
        const active = bulkhead.execute(() => new Promise<void>(resolve => { release = resolve; }));
        await Promise.resolve();
        await expect(bulkhead.execute(async () => undefined)).rejects.toThrow("bulkhead is full");
        release();
        await active;
    });

    it("rejects a concurrent worker while an active delivery lease exists", () => {
        const repository = new InMemoryDeliveryRepository();
        const engine = new ReliableDeliveryEngine(repository, policy);
        const queued = engine.enqueue("ORG-001", "CONNECTOR-001", "EVENT", "event-1", {});
        expect(repository.claim(queued.deliveryId, "worker-1", new Date(Date.now() + 60_000))).toBeDefined();
        expect(repository.claim(queued.deliveryId, "worker-2", new Date(Date.now() + 60_000))).toBeUndefined();
    });
});
