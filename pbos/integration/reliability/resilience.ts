export class CircuitBreaker {
    private failures = 0;
    private openedAt?: number;
    constructor(private readonly failureThreshold = 5, private readonly resetAfterMs = 30_000) {}
    assertAvailable(now = Date.now()): void {
        if (this.openedAt === undefined) return;
        if (now - this.openedAt >= this.resetAfterMs) { this.openedAt = undefined; this.failures = 0; return; }
        throw new Error("Connector delivery circuit is open.");
    }
    success(): void { this.failures = 0; this.openedAt = undefined; }
    failure(now = Date.now()): void { this.failures += 1; if (this.failures >= this.failureThreshold) this.openedAt = now; }
    isOpen(now = Date.now()): boolean { try { this.assertAvailable(now); return false; } catch { return true; } }
}

export class ConcurrencyBulkhead {
    private active = 0;
    constructor(private readonly maximumConcurrent: number) {
        if (maximumConcurrent <= 0) throw new Error("Bulkhead concurrency must be positive.");
    }
    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.active >= this.maximumConcurrent) throw new Error("Connector delivery bulkhead is full.");
        this.active += 1;
        try { return await operation(); } finally { this.active -= 1; }
    }
}

export async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    let timeout: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([operation(controller.signal), new Promise<T>((_resolve, reject) => {
            timeout = setTimeout(() => { controller.abort(); reject(new Error("Connector delivery timed out.")); }, timeoutMs);
        })]);
    } finally { if (timeout) clearTimeout(timeout); }
}
