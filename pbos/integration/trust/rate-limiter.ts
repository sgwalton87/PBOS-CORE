export class ConnectorRateLimiter {
    private readonly windows = new Map<string, { count: number; startedAt: number }>();
    constructor(private readonly maximumRequests: number, private readonly windowMs: number) {
        if (maximumRequests <= 0 || windowMs <= 0) throw new Error("Rate limit must be positive.");
    }
    consume(organizationId: string, connectorId: string, now = Date.now()): void {
        const key = `${organizationId}:${connectorId}`;
        const current = this.windows.get(key);
        if (!current || now - current.startedAt >= this.windowMs) {
            this.windows.set(key, { count: 1, startedAt: now });
            return;
        }
        if (current.count >= this.maximumRequests) throw new Error("Connector rate limit exceeded.");
        current.count += 1;
    }
}
