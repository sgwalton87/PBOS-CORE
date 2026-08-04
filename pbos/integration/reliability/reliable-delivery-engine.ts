import { randomUUID } from "crypto";
import { DeliveryHealth, DeliveryRecord, DeliveryRepository, RetryPolicy } from "./contracts";
import { CircuitBreaker, ConcurrencyBulkhead, withTimeout } from "./resilience";

export type DeliveryHandler = (record: DeliveryRecord, signal: AbortSignal) => Promise<unknown>;
export type RetryClassifier = (error: unknown) => "RETRYABLE" | "TERMINAL";
export type ReplayAuthority = (record: DeliveryRecord, approvalId: string, actorId: string) => boolean;

export class ReliableDeliveryEngine {
    constructor(private readonly repository: DeliveryRepository, private readonly policy: RetryPolicy,
        private readonly circuit = new CircuitBreaker(), private readonly bulkhead = new ConcurrencyBulkhead(10),
        private readonly classify: RetryClassifier = () => "RETRYABLE", private readonly random: () => number = Math.random,
        private readonly delay: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))) {}

    enqueue(organizationId: string, connectorId: string, operation: string, idempotencyKey: string, payload: unknown): DeliveryRecord {
        if (!organizationId || !connectorId || !operation || !idempotencyKey) throw new Error("Delivery requires tenant, connector, operation, and idempotency key.");
        const now = new Date();
        const record: DeliveryRecord = { deliveryId: randomUUID(), organizationId, connectorId, operation, idempotencyKey,
            payload, state: "PENDING", attempts: 0, createdAt: now, updatedAt: now };
        this.repository.save(record);
        return record;
    }

    async deliver(deliveryId: string, handler: DeliveryHandler): Promise<DeliveryRecord> {
        const initial = this.repository.get(deliveryId);
        if (!initial) throw new Error(`Delivery not found: ${deliveryId}`);
        if (initial.state === "DELIVERED") return initial;
        if (initial.state === "DEAD_LETTER") throw new Error("Dead-letter delivery requires governed replay.");
        const leaseId = randomUUID();
        const claimed = this.repository.claim(deliveryId, leaseId, new Date(Date.now() + this.policy.timeoutMs * this.policy.maximumAttempts + 30_000));
        if (!claimed) throw new Error("Delivery is already claimed by another worker.");
        return this.bulkhead.execute(async () => {
            let current = claimed;
            for (let attempt = current.attempts + 1; attempt <= this.policy.maximumAttempts; attempt += 1) {
                this.circuit.assertAvailable();
                try {
                    await withTimeout(signal => handler(current, signal), this.policy.timeoutMs);
                    this.circuit.success();
                    current = { ...current, state: "DELIVERED", attempts: attempt, updatedAt: new Date(), deliveredAt: new Date(),
                        lastError: undefined, leaseId: undefined, leaseExpiresAt: undefined };
                    this.repository.save(current);
                    return current;
                } catch (error) {
                    this.circuit.failure();
                    const message = error instanceof Error ? error.message : String(error);
                    const terminal = this.classify(error) === "TERMINAL" || attempt >= this.policy.maximumAttempts;
                    current = { ...current, state: terminal ? "DEAD_LETTER" : "PROCESSING", attempts: attempt,
                        updatedAt: new Date(), lastError: message,
                        leaseId: terminal ? undefined : current.leaseId, leaseExpiresAt: terminal ? undefined : current.leaseExpiresAt };
                    this.repository.save(current);
                    if (terminal) return current;
                    const base = Math.min(this.policy.maximumDelayMs, this.policy.initialDelayMs * 2 ** (attempt - 1));
                    await this.delay(Math.round(base * (1 - this.policy.jitterRatio + 2 * this.policy.jitterRatio * this.random())));
                }
            }
            return current;
        });
    }

    replay(deliveryId: string, approvalId: string, actorId: string, authorize: ReplayAuthority): DeliveryRecord {
        const current = this.repository.get(deliveryId);
        if (!current || current.state !== "DEAD_LETTER" || !approvalId || !actorId || !authorize(current, approvalId, actorId)) {
            throw new Error("Dead-letter replay denied by governance authority.");
        }
        const replay = { ...current, state: "PENDING" as const, attempts: 0, updatedAt: new Date(), lastError: undefined };
        this.repository.save(replay);
        return replay;
    }

    health(organizationId: string): DeliveryHealth {
        const pending = this.repository.pending(organizationId).length;
        const deadLetters = this.repository.deadLetters(organizationId).length;
        const circuitOpen = this.circuit.isOpen();
        return { state: circuitOpen ? "OPEN_CIRCUIT" : pending || deadLetters ? "DEGRADED" : "HEALTHY",
            pending, deadLetters, circuitOpen };
    }
}
