import { describe, expect, it } from "vitest";
import { GENESIS_CONSUMER_PORTAL, renderGenesisConsumerPortal } from "../genesis-consumer-portal";

describe("PBOS Genesis consumer portal", () => {
    it("keeps the factory and application identities distinct", () => {
        expect(GENESIS_CONSUMER_PORTAL.applications.map(application => application.name)).toEqual([
            "The Playbook", "Bulletproof Beneficiary & Legacy Registry"
        ]);
        const html = renderGenesisConsumerPortal();
        expect(html).toContain("PBOS Genesis — the operating system factory");
        expect(html).toContain("pbos-genesis-master-brand-board.png");
        expect(html).toContain("the-playbook-master-brand-board-v2.png");
        expect(html).toContain("bulletproof-beneficiary-master-brand-board-v3.png");
        expect(html).not.toContain("Playbook Platform");
        expect(html).not.toContain("Bulletproof Group");
    });

    it("renders semantic, mobile-responsive components", () => {
        const html = renderGenesisConsumerPortal();
        expect(html).toContain("<header");
        expect(html).toContain("<main>");
        expect(html).toContain("<footer");
        expect(html).toContain("@media(max-width:640px)");
        expect(html).toContain('name="viewport"');
    });
});
