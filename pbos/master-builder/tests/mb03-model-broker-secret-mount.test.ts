import { describe, expect, it } from "vitest";
import { isAllowedSecretMountPath, isReadOnlySecretMode } from "../../tools/mb03-staging-model-broker-http";

describe("MB-03 Cloud Run secret mounts", () => {
  it("accepts only the dedicated provider-managed mount root", () => {
    expect(isAllowedSecretMountPath("/var/run/secrets/mb03/admin")).toBe(true);
    expect(isAllowedSecretMountPath("/var/run/secrets/mb03-other/admin")).toBe(false);
    expect(isAllowedSecretMountPath("/var/run/admin")).toBe(false);
  });

  it("accepts read-only managed modes and rejects writable files", () => {
    expect(isReadOnlySecretMode(0o400)).toBe(true);
    expect(isReadOnlySecretMode(0o444)).toBe(true);
    expect(isReadOnlySecretMode(0o440)).toBe(true);
    expect(isReadOnlySecretMode(0o644)).toBe(false);
    expect(isReadOnlySecretMode(0o666)).toBe(false);
  });
});
