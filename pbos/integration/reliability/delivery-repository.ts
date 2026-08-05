import { JsonStateStore } from "../../genesis-state/json-state-store";
import { DeliveryRecord, DeliveryRepository } from "./contracts";

const revive = (record: DeliveryRecord): DeliveryRecord => ({ ...record, createdAt: new Date(String(record.createdAt)),
    updatedAt: new Date(String(record.updatedAt)), deliveredAt: record.deliveredAt ? new Date(String(record.deliveredAt)) : undefined,
    leaseExpiresAt: record.leaseExpiresAt ? new Date(String(record.leaseExpiresAt)) : undefined });

export class InMemoryDeliveryRepository implements DeliveryRepository {
    protected readonly records = new Map<string, DeliveryRecord>();
    save(record: DeliveryRecord): void { this.records.set(record.deliveryId, record); }
    get(deliveryId: string): DeliveryRecord | undefined { return this.records.get(deliveryId); }
    claim(deliveryId: string, leaseId: string, leaseExpiresAt: Date): DeliveryRecord | undefined {
        const current = this.records.get(deliveryId);
        if (!current || current.state === "DELIVERED" || current.state === "DEAD_LETTER" ||
            (current.state === "PROCESSING" && current.leaseExpiresAt && current.leaseExpiresAt.getTime() > Date.now())) return undefined;
        const claimed = { ...current, state: "PROCESSING" as const, leaseId, leaseExpiresAt, updatedAt: new Date() };
        this.records.set(deliveryId, claimed);
        return claimed;
    }
    pending(organizationId: string): readonly DeliveryRecord[] {
        return [...this.records.values()].filter(item => item.organizationId === organizationId && item.state === "PENDING");
    }
    deadLetters(organizationId: string): readonly DeliveryRecord[] {
        return [...this.records.values()].filter(item => item.organizationId === organizationId && item.state === "DEAD_LETTER");
    }
}

interface DurableDeliveryState { readonly records: readonly DeliveryRecord[]; }
export class FileDeliveryRepository implements DeliveryRepository {
    private readonly store: JsonStateStore<DurableDeliveryState>;
    constructor(path: string) {
        this.store = new JsonStateStore(path, () => ({ records: [] }));
    }
    save(record: DeliveryRecord): void {
        this.store.update(state => ({
            records: [...state.records.filter(item => item.deliveryId !== record.deliveryId), record]
        }));
    }
    get(deliveryId: string): DeliveryRecord | undefined {
        const record = this.store.read().records.find(item => item.deliveryId === deliveryId);
        return record ? revive(record) : undefined;
    }
    claim(deliveryId: string, leaseId: string, leaseExpiresAt: Date): DeliveryRecord | undefined {
        let claimed: DeliveryRecord | undefined;
        this.store.update(state => {
            const currentValue = state.records.find(item => item.deliveryId === deliveryId);
            const current = currentValue ? revive(currentValue) : undefined;
            if (!current || current.state === "DELIVERED" || current.state === "DEAD_LETTER" ||
                (current.state === "PROCESSING" && current.leaseExpiresAt && current.leaseExpiresAt.getTime() > Date.now())) return state;
            const next: DeliveryRecord = { ...current, state: "PROCESSING", leaseId, leaseExpiresAt, updatedAt: new Date() };
            claimed = next;
            return { records: [...state.records.filter(item => item.deliveryId !== deliveryId), next] };
        });
        return claimed;
    }
    pending(organizationId: string): readonly DeliveryRecord[] { return this.forState(organizationId, "PENDING"); }
    deadLetters(organizationId: string): readonly DeliveryRecord[] { return this.forState(organizationId, "DEAD_LETTER"); }
    private forState(organizationId: string, state: DeliveryRecord["state"]): DeliveryRecord[] {
        return this.store.read().records.filter(item => item.organizationId === organizationId && item.state === state).map(revive);
    }
}
