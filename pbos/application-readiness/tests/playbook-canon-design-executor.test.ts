import { describe, expect, it } from "vitest";
import { compileCanonicalDesignRouteMap } from "../playbook-canon-design-executor";

const existing = `# Canonical Route Map

## Canonical Screens

| Feature | Route | Rendered file | Shared layout | Current status | Duplicate implementations found | Canonical implementation selected | Legacy implementation status |
|---|---|---|---|---|---|---|---|
| Scholar Dashboard | \`/dashboard\` | \`app/dashboard/page.tsx\` | Unified shell | PGSL-007 implemented | old dashboard | canonical dashboard | preserved |

## Existing Design System Inventory

| Category | Current source |
|---|---|
`;

describe("Playbook design canon route compiler", () => {
    it("preserves approved screen canon and binds every visible route to the shared product target", () => {
        const result = compileCanonicalDesignRouteMap(existing,
            ["app/page.tsx", "app/dashboard/page.tsx", "app/feed/page.tsx", "app/api/health/route.ts"], "abcdef1");
        expect(result).toContain("PGSL-007 implemented; PGDS-001 product-shell target");
        expect(result).toContain("| Feed | `/feed` | `app/feed/page.tsx`");
        expect(result).toContain("| Landing Page | `/` | `app/page.tsx`");
        expect(result).not.toContain("app/api/health");
        expect(result.match(/PGDS-001/g)?.length).toBeGreaterThanOrEqual(3);
        expect(result).toContain("a target binding is not visual implementation or certification");
    });

    it("fails closed when the governed screen section cannot be located", () => {
        expect(() => compileCanonicalDesignRouteMap("# missing", ["app/page.tsx"], "abcdef1"))
            .toThrow("screen boundary is malformed");
    });
});
