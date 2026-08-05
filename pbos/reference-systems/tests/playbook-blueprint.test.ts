import { describe, expect, it } from "vitest";
import { createPlaybookBlueprint } from "../playbook-blueprint";

describe("The Playbook build blueprint", () => {
    it("binds the public brand to the stable Playbook system and repository identities", () => {
        const blueprint = createPlaybookBlueprint();
        expect(blueprint.status).toBe("READY_FOR_APPROVAL");
        expect(blueprint.identity.systemName).toBe("The Playbook");
        expect(blueprint.identity.proposedSystemId).toBe("PLAYBOOK-SYSTEM-001");
        expect(blueprint.identity.proposedOperatingSystemId).toBe("PLAYBOOK-OS-001");
        expect(blueprint.application.existingRepository).toBe("sgwalton87/playbook-platform");
        expect(blueprint.foundation.domainPack).toBe("@pbos/domain-education");
        expect(blueprint.design.brand.assets?.[0].assetId).toBe("THE-PLAYBOOK-MASTER-BOARD-002");
    });
});
