import { describe, expect, it } from "vitest";
import { inspectProductionConnector } from "../production-connector-preflight";

const valid = {
  PBOS_ENVIRONMENT:"production",
  PBOS_API_URL:"https://pbos.example.com",
  PBOS_ORGANIZATION_ID:"org-prod",
  PBOS_CONNECTOR_ID:"connector-prod",
  PBOS_CONNECTOR_KEY_ID:"key-prod",
  PBOS_CONNECTOR_SECRET_BASE64:"cHJvZC1jb25uZWN0b3I=",
  PBOS_MESSAGING_JOURNEY_APPROVAL_ID:"approval-prod-001",
};
describe("production connector preflight", () => {
  it("fails closed without configuration", () => {
    const result = inspectProductionConnector({});
    expect(result.readyForOperatorVerification).toBe(false);
    expect(result.missing).toContain("PBOS_MESSAGING_JOURNEY_APPROVAL_ID");
  });
  it("rejects staging hosts and synthetic journey approvals", () => {
    const result = inspectProductionConnector({
      ...valid, PBOS_API_URL:"https://pbos-v1-integration-staging.example.com",
      PBOS_MESSAGING_JOURNEY_APPROVAL_ID:"synthetic-staging-approval",
    });
    expect(result.readyForOperatorVerification).toBe(false);
    expect(result.invalid.some(x=>x.includes("non-production"))).toBe(true);
    expect(result.invalid.some(x=>x.includes("synthetic"))).toBe(true);
  });
  it("rejects preview environment and embedded credentials", () => {
    const result = inspectProductionConnector({
      ...valid, PBOS_ENVIRONMENT:"preview", PBOS_API_URL:"https://user:pass@pbos.example.com",
    });
    expect(result.invalid.length).toBeGreaterThan(0);
  });
  it("valid shape only permits subsequent operator checks, not authorization", () => {
    const result = inspectProductionConnector(valid);
    expect(result.readyForOperatorVerification).toBe(true);
  });
  it("never includes secret material in diagnostics", () => {
    const key = "dG9wLXNlY3JldA==";
    const result = inspectProductionConnector({...valid, PBOS_CONNECTOR_SECRET_BASE64:key,PBOS_API_URL:"invalid"});
    expect(JSON.stringify(result)).not.toContain(key);
  });
});
