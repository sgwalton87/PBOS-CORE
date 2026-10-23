/**
 * Read-only, fail-closed PBOS production connector configuration preflight.
 * This does NOT authenticate a connector or authorize a production release.
 * Never print private environment values, especially signing credentials.
 */
export type ProductionConnectorPreflight = {
  readyForOperatorVerification: boolean;
  missing: string[];
  invalid: string[];
};
const REQUIRED = [
  "PBOS_API_URL", "PBOS_ORGANIZATION_ID", "PBOS_CONNECTOR_ID",
  "PBOS_CONNECTOR_KEY_ID", "PBOS_CONNECTOR_SECRET_BASE64",
  "PBOS_MESSAGING_JOURNEY_APPROVAL_ID",
] as const;

export function inspectProductionConnector(env: Record<string,string|undefined>): ProductionConnectorPreflight {
  const missing = REQUIRED.filter(key => !env[key]?.trim());
  const invalid: string[] = [];
  const endpoint = env.PBOS_API_URL?.trim();
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:") invalid.push("PBOS_API_URL must use HTTPS");
      if (url.username || url.password || url.search || url.hash) invalid.push("PBOS_API_URL must not embed credentials or query parameters");
      if (/(?:staging|preview|localhost|127\.0\.0\.1)/i.test(url.hostname)) invalid.push("PBOS_API_URL points to a non-production host");
    } catch { invalid.push("PBOS_API_URL is not a valid URL"); }
  }
  if (env.PBOS_ENVIRONMENT !== "production") invalid.push("PBOS_ENVIRONMENT must explicitly equal production");
  const secret = env.PBOS_CONNECTOR_SECRET_BASE64;
  if (secret?.trim() && !/^[a-zA-Z0-9+/]+={0,2}$/.test(secret.trim())) invalid.push("PBOS_CONNECTOR_SECRET_BASE64 must be base64");
  if (env.PBOS_MESSAGING_JOURNEY_APPROVAL_ID && /(?:staging|preview|synthetic|test)/i.test(env.PBOS_MESSAGING_JOURNEY_APPROVAL_ID))
    invalid.push("Messaging journey approval appears scoped to staging or synthetic testing");
  return { readyForOperatorVerification: missing.length === 0 && invalid.length === 0, missing, invalid };
}

if (require.main === module) {
  const result = inspectProductionConnector(process.env);
  // A green preflight means configuration shape only, NEVER authority approval.
  process.stdout.write(JSON.stringify(result) + "\n");
  if (!result.readyForOperatorVerification) process.exitCode = 1;
}
