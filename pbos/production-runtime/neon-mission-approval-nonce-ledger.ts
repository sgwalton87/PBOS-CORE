/** Durable, atomic approval replay protection via existing Neon runner SQL connection. */
import type { NeonLeaseSql } from "./neon-fenced-lease-provider";

export class NeonMissionApprovalNonceLedger {
  constructor(private readonly db: NeonLeaseSql) {}
  async consume(nonce: string, missionId: string, repository: string, expiresAt: string): Promise<boolean> {
    const result = await this.db.query<{ consumed: boolean }>(
      "SELECT pbos_runner.consume_mission_approval_nonce($1::uuid,$2,$3,$4::timestamptz) AS consumed",
      [nonce,missionId,repository,expiresAt]);
    return result.rows[0]?.consumed === true;
  }
}
