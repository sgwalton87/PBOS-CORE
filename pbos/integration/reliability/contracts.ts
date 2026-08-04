export type DeliveryState = "PENDING" | "PROCESSING" | "DELIVERED" | "DEAD_LETTER";

export interface DeliveryRecord<T = unknown> {
    readonly deliveryId: string;
    readonly organizationId: string;
    readonly connectorId: string;
    readonly operation: string;
    readonly idempotencyKey: string;
    readonly payload: T;
    readonly state: DeliveryState;
    readonly attempts: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly deliveredAt?: Date;
    readonly lastError?: string;
    readonly leaseId?: string;
    readonly leaseExpiresAt?: Date;
}

export interface DeliveryRepository {
    save(record: DeliveryRecord): void;
    get(deliveryId: string): DeliveryRecord | undefined;
    claim(deliveryId: string, leaseId: string, leaseExpiresAt: Date): DeliveryRecord | undefined;
    pending(organizationId: string): readonly DeliveryRecord[];
    deadLetters(organizationId: string): readonly DeliveryRecord[];
}

export interface RetryPolicy {
    readonly maximumAttempts: number;
    readonly initialDelayMs: number;
    readonly maximumDelayMs: number;
    readonly jitterRatio: number;
    readonly timeoutMs: number;
}

export interface DeliveryHealth {
    readonly state: "HEALTHY" | "DEGRADED" | "OPEN_CIRCUIT";
    readonly pending: number;
    readonly deadLetters: number;
    readonly circuitOpen: boolean;
}
