const SENSITIVE = /authorization|secret|signature|token|cookie|password|service.?role|api.?key/i;

export function redactIntegrationEvidence(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redactIntegrationEvidence);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, SENSITIVE.test(key) ? "[REDACTED]" : redactIntegrationEvidence(item)]));
    return value;
}
