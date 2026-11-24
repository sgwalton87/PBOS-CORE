import type { NeonLeaseSql } from "./neon-fenced-lease-provider";

export interface DisposableGenesisEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly missionId?: string;
  readonly actorId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly leaseResource: string;
  readonly fencingToken: bigint;
}

export class NeonDisposableGenesisState {
  constructor(private readonly db: NeonLeaseSql, private readonly namespace: string) {
    if (!/^[A-Za-z0-9._-]+$/.test(namespace)) throw new Error("Invalid disposable Genesis namespace.");
  }

  async initialize(sourceStatePin: string, authorityId: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(sourceStatePin) || !/^[a-f0-9-]{36}$/.test(authorityId)) {
      throw new Error("Disposable Genesis lineage is invalid.");
    }
    await this.db.query(
      "SELECT pbos_runner.initialize_mb03_disposable_namespace($1,$2,$3::uuid) AS initialized",
      [this.namespace, sourceStatePin, authorityId],
    );
  }

  async append(event: DisposableGenesisEvent, expectedSequence: bigint): Promise<bigint> {
    if (!/^[a-f0-9-]{36}$/.test(event.eventId) || !event.eventType.trim() || !event.actorId.trim() ||
        !event.leaseResource.trim() || expectedSequence < 0n || event.fencingToken < 1n) {
      throw new Error("Disposable Genesis event is invalid.");
    }
    const result = await this.db.query<{ sequence: string | number | bigint }>(
      "SELECT pbos_runner.append_mb03_disposable_event($1,$2::uuid,$3,$4,$5,$6::jsonb,$7::text,$8::bigint,$9::bigint) AS sequence",
      [this.namespace, event.eventId, event.eventType, event.missionId ?? null, event.actorId,
        JSON.stringify(event.payload), event.leaseResource, event.fencingToken.toString(), expectedSequence.toString()],
    );
    const sequence = result.rows[0]?.sequence;
    if (sequence === undefined || sequence === null) throw new Error("Disposable event append returned no sequence.");
    return BigInt(sequence);
  }
}
