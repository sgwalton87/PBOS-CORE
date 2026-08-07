import { describe, expect, it } from "vitest";
import { ApplicationDeliveryGenerator } from "../index";

describe("CIP-048 and CIP-049 application delivery", () => {
    it("generates web, iOS, and Android foundations without performing protected releases", () => {
        const delivery = new ApplicationDeliveryGenerator().generate({
            systemId: "PLAYBOOK-SYSTEM-001", applicationName: "The Playbook",
            bundleNamespace: "com.playbook.platform", universalLinkDomain: "app.playbook.example",
            targets: ["WEB", "IOS", "ANDROID"], journeys: ["IDENTITY_ONBOARDING", "DASHBOARD", "MESSAGING"],
            brandAssets: [{ assetId: "PLAYBOOK-LOGO-001", kind: "PRIMARY_LOGO", location: "assets/playbook.svg", rightsConfirmed: true }]
        });
        expect(delivery.targets).toEqual(["WEB", "IOS", "ANDROID"]);
        expect(delivery.files.map(file => file.path)).toContain("delivery/mobile/app.config.ts");
        expect(delivery.files.map(file => file.path)).toContain("delivery/shared/brand-assets.json");
        expect(delivery.files.map(file => file.path)).toContain("delivery/mobile/platform-boundaries.ts");
        expect(delivery.files.map(file => file.path)).toContain("apps/mobile/package.json");
        expect(delivery.files.map(file => file.path)).toContain("apps/mobile/src/platform/session-store.ts");
        expect(delivery.files.map(file => file.path)).toContain("apps/mobile/app/dashboard.tsx");
        expect(delivery.files.find(file => file.path === "apps/mobile/app.config.ts")?.content).toContain("com.playbook.platform");
        expect(delivery.files.find(file => file.path === "apps/mobile/src/platform/deep-links.ts")?.content).toContain("Secrets are forbidden");
        expect(delivery.files.find(file => file.path === "apps/mobile/src/platform/api.ts")?.content)
            .toContain("EXPO_PUBLIC_PBOS_APPLICATION_API_URL");
        expect(delivery.files.find(file => file.path === "apps/mobile/src/platform/api.ts")?.content)
            .toContain("new Headers(init.headers)");
        expect(delivery.files.find(file => file.path === "apps/mobile/src/theme.ts")?.content).not.toContain("playbookTheme");
        expect(delivery.files.find(file => file.path === "apps/mobile/src/platform/api.ts")?.content)
            .toContain("The Playbook request failed");
        expect(delivery.files.find(file => file.path === "delivery/shared/brand-assets.json")?.content).toContain("PLAYBOOK-LOGO-001");
        expect(delivery.storeRequirements.IOS).toContain("TESTFLIGHT_PASS");
        expect(delivery.storeRequirements.ANDROID).toContain("SIGNED_AAB");
        expect(delivery.protectedReleaseActions).toContain("PRODUCTION_RELEASE");
    });

    it("requires responsive web and valid application ownership identifiers", () => {
        const generator = new ApplicationDeliveryGenerator();
        expect(() => generator.generate({ systemId: "PLAYBOOK-SYSTEM-001", applicationName: "Playbook",
            bundleNamespace: "invalid", universalLinkDomain: "app.playbook.example", targets: ["IOS"] })).toThrow();
        expect(() => generator.generate({ systemId: "PLAYBOOK-SYSTEM-001", applicationName: "Playbook",
            bundleNamespace: "com.playbook.platform", universalLinkDomain: "app.playbook.example", targets: ["IOS"] })).toThrow("responsive web");
    });

    it("keeps the reusable native generator free of Playbook-specific identity", () => {
        const delivery = new ApplicationDeliveryGenerator().generate({
            systemId: "EXAMPLE-SYSTEM-001", applicationName: "Example Health",
            bundleNamespace: "com.example.health", universalLinkDomain: "app.example.health",
            targets: ["WEB", "IOS", "ANDROID"]
        });
        const nativeSource = delivery.files.filter(file => file.path.startsWith("apps/mobile/"))
            .map(file => file.content).join("\n");
        expect(nativeSource).toContain("Example Health request failed");
        expect(nativeSource).not.toContain("Playbook");
    });
});
