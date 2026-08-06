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
        const journeys = [...new Set(request.journeys ?? ["IDENTITY_ONBOARDING", "DASHBOARD", "MESSAGING", "DOCUMENTS", "NOTIFICATIONS"])];
        const files = [
            { path: "delivery/web/manifest.json", content: `${JSON.stringify({ target: "WEB", responsive: true,
                accessibilityStandard: "WCAG_2_2_AA", deployment: "APPROVAL_REQUIRED" }, null, 2)}\n` },
            { path: "delivery/shared/contracts.ts", content: "export interface GovernedSession { actorId: string; organizationId: string; authority: readonly string[]; provenance: readonly string[] }\n" },
            { path: "delivery/shared/security.ts", content: "export const releaseBoundaries = [\"NO_EMBEDDED_SECRETS\", \"SIGNED_PBOS_REQUESTS\", \"PRIVATE_DATA_MINIMIZATION\"] as const;\n" },
            { path: "delivery/shared/journeys.json", content: `${JSON.stringify({ journeys }, null, 2)}\n` },
            { path: "delivery/shared/design-tokens.json", content: `${JSON.stringify(request.designTokens ?? {}, null, 2)}\n` },
            { path: "delivery/shared/brand-assets.json", content: `${JSON.stringify({ assets: request.brandAssets ?? [],
                policy: "Use only approved integrity-verified product assets; never substitute the PBOS Genesis identity." }, null, 2)}\n` }
        ];
        if (mobile) files.push(
            { path: "delivery/mobile/app.config.ts", content: `export default { name: ${JSON.stringify(request.applicationName)}, slug: ${JSON.stringify(request.systemId.toLowerCase())}, scheme: ${JSON.stringify(request.systemId.toLowerCase())}, ios: { bundleIdentifier: ${JSON.stringify(request.bundleNamespace)} }, android: { package: ${JSON.stringify(request.bundleNamespace)} }, extra: { universalLinkDomain: ${JSON.stringify(request.universalLinkDomain)} } };\n` },
            { path: "delivery/mobile/eas.json", content: `${JSON.stringify({ build: {
                development: { developmentClient: true, distribution: "internal" },
                preview: { distribution: "internal" }, production: { autoIncrement: true }
            }, submit: { production: {} } }, null, 2)}\n` },
            { path: "delivery/mobile/security.ts", content: "export const mobileSecurity = { tokenStorage: \"NATIVE_SECURE_STORAGE\", logsContainPrivateData: false, certificatePinningDecision: \"SECURITY_REVIEW_REQUIRED\" } as const;\n" },
            { path: "delivery/mobile/platform-boundaries.ts", content: "export interface SecureTokenStore { read(): Promise<string | undefined>; write(value: string): Promise<void>; clear(): Promise<void> }\nexport interface DeepLinkBoundary { parse(url: string): { route: string; token?: never } }\nexport interface PushBoundary { registerWithConsent(actorId: string): Promise<string> }\n" },
            { path: "delivery/mobile/journey-contract.ts", content: `export const requiredMobileJourneys = ${JSON.stringify(journeys)} as const;\nexport type RequiredMobileJourney = typeof requiredMobileJourneys[number];\n` },
            { path: "delivery/mobile/release-checklist.md", content: "# Mobile release gate\n\n- [ ] Device validation\n- [ ] Accessibility validation\n- [ ] Privacy manifest review\n- [ ] Signing approval\n- [ ] TestFlight approval\n- [ ] Play internal testing approval\n- [ ] Human release certification\n" },
            ...this.nativeApplication(request, journeys)
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

    private nativeApplication(request: ApplicationDeliveryRequest, journeys: readonly string[]) {
        const packageJson = {
            name: `@${request.systemId.toLowerCase()}/mobile`, version: "0.1.0", private: true,
            main: "expo-router/entry",
            scripts: { start: "expo start", ios: "expo start --ios", android: "expo start --android",
                typecheck: "tsc --noEmit", test: "vitest run", doctor: "expo-doctor" },
            dependencies: { expo: "~57.0.0", "expo-linking": "~57.0.3", "expo-notifications": "~57.0.6",
                "expo-router": "~57.0.2", "expo-secure-store": "*", react: "19.2.3", "react-native": "0.86.0",
                "react-native-safe-area-context": "*", "react-native-screens": "*" },
            devDependencies: { "@types/react": "^19.0.0", "expo-doctor": "*", typescript: "^5.9.0", vitest: "^4.1.0" }
        };
        const appConfig = `import type { ExpoConfig } from "expo/config";\n\nconst config: ExpoConfig = {\n` +
            `  name: ${JSON.stringify(request.applicationName)},\n  slug: ${JSON.stringify(request.systemId.toLowerCase())},\n` +
            `  scheme: ${JSON.stringify(request.systemId.toLowerCase())},\n  version: "0.1.0",\n  orientation: "portrait",\n` +
            `  plugins: ["expo-router", "expo-secure-store", "expo-notifications"],\n  experiments: { typedRoutes: true },\n` +
            `  ios: { bundleIdentifier: ${JSON.stringify(request.bundleNamespace)}, associatedDomains: [${JSON.stringify(`applinks:${request.universalLinkDomain}`)}] },\n` +
            `  android: { package: ${JSON.stringify(request.bundleNamespace)}, intentFilters: [{ action: "VIEW", autoVerify: true,` +
            ` data: [{ scheme: "https", host: ${JSON.stringify(request.universalLinkDomain)}, pathPrefix: "/mobile" }],` +
            ` category: ["BROWSABLE", "DEFAULT"] }] },\n  extra: { universalLinkDomain: ${JSON.stringify(request.universalLinkDomain)},` +
            ` systemId: ${JSON.stringify(request.systemId)} }\n};\n\nexport default config;\n`;
        const sessionStore = `import * as SecureStore from "expo-secure-store";\n\nconst SESSION_KEY = ${JSON.stringify(`pbos.${request.systemId.toLowerCase()}.session.v1`)};\n` +
            `export interface GovernedMobileSession { accessToken: string; actorId: string; expiresAt: string; provenance: readonly string[] }\n` +
            `export async function readSession(): Promise<GovernedMobileSession | undefined> { const value = await SecureStore.getItemAsync(SESSION_KEY);` +
            ` if (!value) return undefined; const session = JSON.parse(value) as GovernedMobileSession;` +
            ` if (!session.accessToken || Date.parse(session.expiresAt) <= Date.now() || session.provenance.length === 0) { await clearSession(); return undefined; } return session; }\n` +
            `export async function writeSession(session: GovernedMobileSession): Promise<void> { if (!session.accessToken || !session.actorId || session.provenance.length === 0)` +
            ` throw new Error("Governed session requires identity and provenance."); await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session),` +
            ` { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); }\n` +
            `export async function clearSession(): Promise<void> { await SecureStore.deleteItemAsync(SESSION_KEY); }\n`;
        const deepLinks = `const SCHEME = ${JSON.stringify(request.systemId.toLowerCase())};\nconst DOMAIN = ${JSON.stringify(request.universalLinkDomain)};\n` +
            `const routes = new Set(["dashboard","onboarding","messages","documents","notifications"]);\n` +
            `export function parseGovernedDeepLink(value: string): string { const url = new URL(value);` +
            ` const custom = url.protocol === SCHEME + ":"; const universal = url.protocol === "https:" && url.hostname === DOMAIN;` +
            ` if (!custom && !universal) throw new Error("Untrusted deep-link origin.");` +
            ` if ([...url.searchParams.keys()].some(key => /token|secret|password/i.test(key))) throw new Error("Secrets are forbidden in deep links.");` +
            ` const route = (custom ? url.hostname + url.pathname : url.pathname.replace(/^\\/mobile\\/?/, "")).replace(/^\\/+|\\/+$/g, "");` +
            ` if (!routes.has(route)) throw new Error("Deep-link route is not governed."); return "/" + route; }\n`;
        const notifications = `import * as Notifications from "expo-notifications";\n` +
            `export async function registerNotifications(consent: boolean): Promise<string | undefined> { if (!consent) return undefined;` +
            ` const permission = await Notifications.requestPermissionsAsync(); if (permission.status !== "granted") return undefined;` +
            ` const token = await Notifications.getDevicePushTokenAsync(); return token.data; }\n`;
        const api = `import { readSession } from "./session-store";\nconst apiUrl = process.env.EXPO_PUBLIC_PBOS_APPLICATION_API_URL;\n` +
            `export async function governedApplicationRequest<T>(path: string, init: RequestInit = {}): Promise<T> { if (!apiUrl?.startsWith("https://"))` +
            ` throw new Error("A secure application API URL is required."); const session = await readSession(); if (!session) throw new Error("Authentication required.");` +
            ` const headers = new Headers(init.headers); headers.set("authorization", "Bearer " + session.accessToken); headers.set("content-type", "application/json");` +
            ` headers.set("x-pbos-system-id", ${JSON.stringify(request.systemId)}); const response = await fetch(new URL(path, apiUrl), { ...init, headers });` +
            ` if (!response.ok) throw new Error(${JSON.stringify(`${request.applicationName} request failed: `)} + response.status); return response.json() as Promise<T>; }\n`;
        const theme = `export const applicationTheme = { colors: { primary: ${JSON.stringify(request.designTokens?.colors.primary ?? "#111827")},` +
            ` accent: ${JSON.stringify(request.designTokens?.colors.accent ?? "#2563EB")}, surface: ${JSON.stringify(request.designTokens?.colors.surface ?? "#FFFFFF")},` +
            ` background: ${JSON.stringify(request.designTokens?.colors.background ?? "#F8FAFC")}, text: ${JSON.stringify(request.designTokens?.colors.text ?? "#111827")},` +
            ` muted: ${JSON.stringify(request.designTokens?.colors.textMuted ?? "#64748B")} }, spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },` +
            ` radius: { card: ${JSON.stringify(request.designTokens?.radius.large ?? "20px")}, control: ${JSON.stringify(request.designTokens?.radius.medium ?? "12px")} } } as const;\n`;
        const journeyContract = `export const mobileJourneyContract = ${JSON.stringify(journeys)} as const;\n` +
            `export type MobileJourney = typeof mobileJourneyContract[number];\n` +
            `export const primaryMobileRoutes = ["/onboarding","/dashboard","/messages","/documents","/notifications"] as const;\n`;
        const layout = `import { Stack } from "expo-router";\nexport default function RootLayout() { return <Stack screenOptions={{ headerShown: false }} />; }\n`;
        const index = `import { Redirect } from "expo-router";\nexport default function Index() { return <Redirect href="/login" />; }\n`;
        const login = `import { useState } from "react"; import { router } from "expo-router"; import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";` +
            ` import { applicationTheme as t } from "../src/theme";\nexport default function Login() { const [email,setEmail]=useState(""); return <View style={s.page}` +
            ` accessibilityLabel=${JSON.stringify(`${request.applicationName} mobile login`)}><Text style={s.kicker}>${request.applicationName.toUpperCase()}</Text><Text style={s.title}>Continue your journey.</Text>` +
            `<TextInput accessibilityLabel="Email" autoCapitalize="none" inputMode="email" value={email} onChangeText={setEmail} style={s.input} />` +
            `<Pressable accessibilityRole="button" disabled={!email.includes("@")} onPress={()=>router.replace("/onboarding")} style={s.button}><Text style={s.buttonText}>Continue securely</Text></Pressable>` +
            `<Text style={s.note}>Authentication tokens are stored only in native secure storage.</Text></View> }\n` +
            `const s=StyleSheet.create({page:{flex:1,justifyContent:"center",padding:t.spacing.xl,backgroundColor:t.colors.primary},kicker:{color:t.colors.accent,fontWeight:"800",letterSpacing:3},title:{color:t.colors.surface,fontSize:42,fontWeight:"900",marginVertical:t.spacing.lg},input:{backgroundColor:t.colors.surface,borderRadius:12,padding:t.spacing.md},button:{backgroundColor:t.colors.accent,padding:t.spacing.md,borderRadius:12,marginTop:t.spacing.md},buttonText:{color:t.colors.surface,textAlign:"center",fontWeight:"800"},note:{color:t.colors.muted,marginTop:t.spacing.md}});\n`;
        const screen = (name: string, title: string, body: string) => `import { Link } from "expo-router"; import { ScrollView, StyleSheet, Text, View } from "react-native"; import { applicationTheme as t } from "../src/theme";\n` +
            `export default function ${name}(){return <ScrollView contentContainerStyle={s.page}><Text style={s.kicker}>${request.applicationName.toUpperCase()}</Text><Text style={s.title}>${title}</Text><Text style={s.body}>${body}</Text>` +
            `<View style={s.card} accessibilityRole="summary"><Text style={s.cardTitle}>Governed and connected</Text><Text>Identity, authority, durable data, and PBOS provenance remain enforced.</Text></View>` +
            `<Link href="/dashboard" style={s.link}>Dashboard</Link><Link href="/messages" style={s.link}>Messages</Link><Link href="/documents" style={s.link}>Documents</Link><Link href="/notifications" style={s.link}>Notifications</Link></ScrollView>}\n` +
            `const s=StyleSheet.create({page:{flexGrow:1,padding:t.spacing.lg,paddingTop:64,backgroundColor:t.colors.background},kicker:{color:t.colors.accent,fontWeight:"800",letterSpacing:2},title:{fontSize:34,fontWeight:"900",color:t.colors.primary,marginVertical:t.spacing.md},body:{fontSize:18,color:t.colors.muted,lineHeight:27},card:{backgroundColor:t.colors.surface,padding:t.spacing.lg,borderRadius:20,marginVertical:t.spacing.lg},cardTitle:{fontWeight:"800",fontSize:18,marginBottom:t.spacing.sm},link:{color:t.colors.primary,fontWeight:"800",paddingVertical:t.spacing.sm}});\n`;
        const boundaryTest = `import { describe, expect, it } from "vitest"; import { parseGovernedDeepLink } from "../src/platform/deep-links";\n` +
            `describe("native platform boundaries",()=>{it("accepts governed routes and rejects credential-bearing links",()=>{expect(parseGovernedDeepLink(${JSON.stringify(`${request.systemId.toLowerCase()}://dashboard`)})).toBe("/dashboard");` +
            ` expect(()=>parseGovernedDeepLink(${JSON.stringify(`${request.systemId.toLowerCase()}://dashboard?token=secret`)})).toThrow("Secrets"); expect(()=>parseGovernedDeepLink("https://attacker.invalid/mobile/dashboard")).toThrow("Untrusted");});});\n`;
        const journeyTest = `import { describe, expect, it } from "vitest"; import { mobileJourneyContract, primaryMobileRoutes } from "../src/journeys";\n` +
            `describe("mobile journey contract",()=>{it("materializes the required governed experiences",()=>{expect(mobileJourneyContract).toEqual(${JSON.stringify(journeys)}); expect(primaryMobileRoutes).toContain("/messages"); expect(primaryMobileRoutes).toContain("/notifications");});});\n`;
        return [
            { path: "apps/mobile/package.json", content: `${JSON.stringify(packageJson, null, 2)}\n` },
            { path: "apps/mobile/tsconfig.json", content: `${JSON.stringify({ extends: "expo/tsconfig.base", compilerOptions: { strict: true }, include: ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"] }, null, 2)}\n` },
            { path: "apps/mobile/expo-env.d.ts", content: "/// <reference types=\"expo/types\" />\n" },
            { path: "apps/mobile/app.config.ts", content: appConfig },
            { path: "apps/mobile/eas.json", content: `${JSON.stringify({ cli: { appVersionSource: "remote" }, build: { development: { developmentClient: true, distribution: "internal" }, preview: { distribution: "internal" }, production: { autoIncrement: true } }, submit: { production: {} } }, null, 2)}\n` },
            { path: "apps/mobile/src/theme.ts", content: theme },
            { path: "apps/mobile/src/journeys.ts", content: journeyContract },
            { path: "apps/mobile/src/platform/session-store.ts", content: sessionStore },
            { path: "apps/mobile/src/platform/deep-links.ts", content: deepLinks },
            { path: "apps/mobile/src/platform/notifications.ts", content: notifications },
            { path: "apps/mobile/src/platform/api.ts", content: api },
            { path: "apps/mobile/app/_layout.tsx", content: layout },
            { path: "apps/mobile/app/index.tsx", content: index },
            { path: "apps/mobile/app/login.tsx", content: login },
            { path: "apps/mobile/app/onboarding.tsx", content: screen("Onboarding", "Build your journey", "Capture identity, goals, academics, and trusted support with explicit authority.") },
            { path: "apps/mobile/app/dashboard.tsx", content: screen("Dashboard", "Your next step", "See current goals, progress, opportunities, actions, and support in one mobile view.") },
            { path: "apps/mobile/app/messages.tsx", content: screen("Messages", "Your support network", "Exchange durable messages only with authorized participants.") },
            { path: "apps/mobile/app/documents.tsx", content: screen("Documents", "Secure documents", "Review application documents without placing secrets in links or device logs.") },
            { path: "apps/mobile/app/notifications.tsx", content: screen("Notifications", "Stay on your path", "Receive consent-based, recoverable updates from the governed notification outbox.") },
            { path: "apps/mobile/tests/platform-boundaries.test.ts", content: boundaryTest },
            { path: "apps/mobile/tests/journeys.test.ts", content: journeyTest },
            { path: "apps/mobile/.env.example", content: "EXPO_PUBLIC_PBOS_APPLICATION_API_URL=\nEXPO_PUBLIC_SUPABASE_URL=\nEXPO_PUBLIC_SUPABASE_ANON_KEY=\n" },
            { path: "apps/mobile/README.md", content: `# ${request.applicationName} mobile\n\nPBOS-generated Expo foundation for iOS and Android. Store credentials, signing, submission, and production release remain protected actions.\n` }
        ];
    }
}
