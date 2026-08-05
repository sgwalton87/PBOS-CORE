import { RepositoryInspection } from "../platform";
import { ApplicationJourney, ApplicationRepositoryInventory, JourneyEvidence } from "./contracts";

const JOURNEY_TOKENS: Readonly<Record<ApplicationJourney, readonly string[]>> = {
    IDENTITY_ONBOARDING: ["identity", "auth", "onboarding", "profile"],
    DASHBOARD: ["dashboard", "home"],
    ACADEMIC: ["academic", "scholar", "transcript", "course", "education"],
    OPPORTUNITY: ["opportunity", "scholarship", "career"],
    APPLICATIONS: ["application", "admission"],
    SUPPORT_NETWORK: ["support", "mentor", "coach", "family", "community"],
    MESSAGING: ["message", "inbox", "chat"],
    DOCUMENTS: ["document", "upload", "storage", "vault"],
    NOTIFICATIONS: ["notification", "alert", "push"]
};

const matches = (path: string, tokens: readonly string[]): boolean => tokens.some(token => path.toLowerCase().includes(token));
const source = (path: string): boolean => /\.(tsx?|jsx?)$/.test(path) && !/\.(test|spec)\./.test(path);
const test = (path: string): boolean => /\.(test|spec)\.(tsx?|jsx?)$/.test(path);

export class RepositoryReadinessInventoryCompiler {
    compile(inspection: RepositoryInspection): ApplicationRepositoryInventory {
        const files = inspection.files;
        if (!files) throw new Error("Repository readiness inventory requires the governed tracked-file list.");
        const repository = `${inspection.repository.owner}/${inspection.repository.name}`;
        const evidence = (Object.entries(JOURNEY_TOKENS) as readonly [ApplicationJourney, readonly string[]][])
            .flatMap(([journey, tokens]) => {
                const implementationPaths = files.filter(path => source(path) && matches(path, tokens));
                const testPaths = files.filter(path => test(path) && matches(path, tokens));
                if (!implementationPaths.length && !testPaths.length) return [];
                const relevant = [...implementationPaths, ...testPaths];
                const governedData = files.some(path => /supabase\/migrations|schema|repository|data-source/i.test(path) && matches(path, tokens));
                const authority = files.some(path => /authority|provenance|connector|auth/i.test(path) && matches(path, tokens));
                const responsive = relevant.some(path => /responsive|mobile|viewport/i.test(path));
                const accessible = relevant.some(path => /accessib|a11y|aria/i.test(path));
                return [{ journey, surface: "WEB" as const, implementationPaths, testPaths,
                    usesDurableData: governedData, authorityAndProvenance: authority, responsive, accessible } satisfies JourneyEvidence];
            });
        const candidateFiles = files.filter(path => source(path) && /^(app|src|lib|features|pbos\/generated)\//.test(path));
        const grouped = new Map<string, string[]>();
        candidateFiles.forEach(path => {
            const parts = path.split("/");
            // Deep trees are grouped by feature (for example src/app/dashboard),
            // while shallow modules retain their filename so unrelated lib files
            // cannot be collapsed into one falsely mapped unit.
            const depth = parts.length <= 3 ? parts.length : Math.min(parts.length - 1, 3);
            const unitId = parts.slice(0, depth).join("/").replace(/\.[^.]+$/, "") || parts[0];
            grouped.set(unitId, [...(grouped.get(unitId) ?? []), path]);
        });
        const units = [...grouped.entries()].map(([unitId, paths]) => ({ unitId, paths,
            journeys: (Object.entries(JOURNEY_TOKENS) as readonly [ApplicationJourney, readonly string[]][])
                .filter(([, tokens]) => paths.some(path => matches(path, tokens))).map(([journey]) => journey) }));
        return { repository, revision: inspection.revision, branch: inspection.repository.defaultBranch,
            routeCount: files.filter(path => /(^|\/)(page|route)\.(tsx?|jsx?)$/.test(path)).length,
            testCount: files.filter(test).length,
            databaseFileCount: files.filter(path => /supabase\/migrations|prisma\/migrations|schema\.(sql|prisma)/i.test(path)).length,
            units, evidence };
    }
}
