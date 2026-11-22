import { describe, expect, it, vi } from "vitest";
import { CloudMissionAuthorityGate } from "../cloud-mission-authority-gate";
import type { FencedCloudStateCoordinator } from "../fenced-cloud-state-coordinator";

const fingerprint = "a".repeat(64);
function setup() {
  const verifyCanonicalState = vi.fn().mockResolvedValue(7n);
  const acquire = vi.fn().mockResolvedValue({
    resource: "pbos-mission:playbook", ownerId: "00000000-0000-4000-8000-000000000001",
    fencingToken: 4n, expiresAt: new Date(Date.now() + 20000)
  });
  const gate = new CloudMissionAuthorityGate({ verifyCanonicalState, acquire } as unknown as FencedCloudStateCoordinator);
  return { gate, verifyCanonicalState, acquire };
}
describe("CloudMissionAuthorityGate", () => {
  it("refuses execution if Genesis is missing", async () => {
    const { gate, verifyCanonicalState, acquire } = setup();
    verifyCanonicalState.mockRejectedValue(new Error("Canonical Genesis state is missing"));
    const execute = vi.fn();
    await expect(gate.authorize({resource:"pbos-mission:playbook",expectedGenesisSha256:fingerprint,execute}))
      .rejects.toThrow("Canonical Genesis state is missing");
    expect(acquire).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it("refuses execution when another runner owns the lease", async () => {
    const { gate, acquire } = setup();
    acquire.mockRejectedValue(new Error("PBOS mission lease is held by another runner"));
    const execute = vi.fn();
    await expect(gate.authorize({resource:"pbos-mission:playbook",expectedGenesisSha256:fingerprint,execute}))
      .rejects.toThrow("lease is held");
    expect(execute).not.toHaveBeenCalled();
  });
  it("passes the verified version and fenced lease to an authorized executor", async () => {
    const { gate, verifyCanonicalState, acquire } = setup();
    const execute = vi.fn().mockResolvedValue("ok");
    await expect(gate.authorize({resource:"pbos-mission:playbook",expectedGenesisSha256:fingerprint,execute}))
      .resolves.toBe("ok");
    expect(verifyCanonicalState).toHaveBeenCalledWith(fingerprint);
    expect(acquire).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({fencingToken:4n}),7n);
  });
  it("rejects an expired lease", async () => {
    const { gate, acquire } = setup();
    acquire.mockResolvedValue({expiresAt:new Date(0)});
    const execute = vi.fn();
    await expect(gate.authorize({resource:"pbos-mission:playbook",expectedGenesisSha256:fingerprint,execute}))
      .rejects.toThrow("expired");
    expect(execute).not.toHaveBeenCalled();
  });
});
