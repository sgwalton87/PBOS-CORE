import { ApplicationDeliveryBlueprint, ApplicationDeliveryRequest, DeliveryTarget } from "./contracts";

const uniqueTargets = (targets: readonly DeliveryTarget[]): readonly DeliveryTarget[] => [...new Set(targets)];

export class ApplicationDeliveryGenerator {
    generate(request: ApplicationDeliveryRequest): ApplicationDeliveryBlueprint {
        if (!request.systemId.trim() || !request.applicationName.trim()) throw new Error("Delivery requires a system and application name.");
        if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/.test(request.bundleNamespace)) {
            throw new Error("Delivery requires a reverse-domain bundle namespace.");
        }
        if (!/^[a-z0-9.-]+$/.test(request.universalLinkDomain)) throw new Error("Delivery requires a valid universal-link domain.");
        const targets = uniqueTargets(request.targets);
        if (!targets.includes("WEB")) throw new Error("PBOS application delivery requires a responsive web target.");
        const mobile = targets.includes("IOS") || targets.includes("ANDROID");
        const files = [
            { path: "delivery/web/manifest.json", content: `${JSON.stringify({ target: "WEB", responsive: true,
                accessibilityStandard: "WCAG_2_2_AA", deployment: "APPROVAL_REQUIRED" }, null, 2)}\n` },
            { path: "delivery/shared/contracts.ts", content: "export interface GovernedSession { actorId: string; organizationId: string; authority: readonly string[]; provenance: readonly string[] }\n" },
            { path: "delivery/shared/security.ts", content: "export const releaseBoundaries = [\"NO_EMBEDDED_SECRETS\", \"SIGNED_PBOS_REQUESTS\", \"PRIVATE_DATA_MINIMIZATION\"] as const;\n" }
        ];
        if (mobile) files.push(
            { path: "delivery/mobile/app.config.ts", content: `export default { name: ${JSON.stringify(request.applicationName)}, slug: ${JSON.stringify(request.systemId.toLowerCase())}, scheme: ${JSON.stringify(request.systemId.toLowerCase())}, ios: { bundleIdentifier: ${JSON.stringify(request.bundleNamespace)} }, android: { package: ${JSON.stringify(request.bundleNamespace)} }, extra: { universalLinkDomain: ${JSON.stringify(request.universalLinkDomain)} } };\n` },
            { path: "delivery/mobile/eas.json", content: `${JSON.stringify({ build: {
                development: { developmentClient: true, distribution: "internal" },
                preview: { distribution: "internal" }, production: { autoIncrement: true }
            }, submit: { production: {} } }, null, 2)}\n` },
            { path: "delivery/mobile/security.ts", content: "export const mobileSecurity = { tokenStorage: \"NATIVE_SECURE_STORAGE\", logsContainPrivateData: false, certificatePinningDecision: \"SECURITY_REVIEW_REQUIRED\" } as const;\n" },
            { path: "delivery/mobile/release-checklist.md", content: "# Mobile release gate\n\n- [ ] Device validation\n- [ ] Accessibility validation\n- [ ] Privacy manifest review\n- [ ] Signing approval\n- [ ] TestFlight approval\n- [ ] Play internal testing approval\n- [ ] Human release certification\n" }
        );
        return {
            systemId: request.systemId, targets, files,
            sharedBoundaries: ["SHARED_CONTRACTS", "SHARED_DESIGN_TOKENS", "PBOS_CONNECTOR_SDK", "PLATFORM_ISOLATION", "NO_EMBEDDED_SECRETS"],
            protectedReleaseActions: ["CREATE_SIGNING_IDENTITY", "UPLOAD_STORE_CREDENTIAL", "SUBMIT_APP_STORE", "SUBMIT_PLAY_STORE", "PRODUCTION_RELEASE"],
            storeRequirements: {
                IOS: ["APPLE_DEVELOPER_ACCOUNT", "BUNDLE_ID", "PRIVACY_MANIFEST", "APP_PRIVACY_DISCLOSURE", "TESTFLIGHT_PASS", "APP_REVIEW_APPROVAL"],
                ANDROID: ["PLAY_CONSOLE_ACCOUNT", "APPLICATION_ID", "DATA_SAFETY_DISCLOSURE", "SIGNED_AAB", "INTERNAL_TEST_PASS", "PLAY_REVIEW_APPROVAL"]
            }
        };
    }
}
