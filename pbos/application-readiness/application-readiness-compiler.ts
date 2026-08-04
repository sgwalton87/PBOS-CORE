import { ApplicationJourney, ApplicationReadinessGap, ApplicationReadinessReport, ApplicationRepositoryInventory, ApplicationSurface } from "./contracts";

const WEB: readonly ApplicationJourney[] = ["IDENTITY_ONBOARDING", "DASHBOARD", "ACADEMIC", "OPPORTUNITY", "APPLICATIONS", "SUPPORT_NETWORK", "MESSAGING", "DOCUMENTS", "NOTIFICATIONS"];
const MOBILE: readonly ApplicationJourney[] = ["IDENTITY_ONBOARDING", "DASHBOARD", "MESSAGING", "DOCUMENTS", "NOTIFICATIONS"];

export class ApplicationReadinessCompiler {
    compile(inventory: ApplicationRepositoryInventory): ApplicationReadinessReport {
        if (!/^[a-f0-9]{7,40}$/i.test(inventory.revision) || !inventory.repository.includes("/")) {
            throw new Error("Application readiness requires an exact repository revision.");
        }
        if ([inventory.routeCount, inventory.testCount, inventory.databaseFileCount]
            .some(value => !Number.isInteger(value) || value < 0)) throw new Error("Repository inventory counts are invalid.");
        const required: readonly [ApplicationSurface, readonly ApplicationJourney[]][] = [
            ["WEB", WEB], ["IOS", MOBILE], ["ANDROID", MOBILE]
        ];
        const gaps = required.flatMap(([surface, journeys]) => journeys.flatMap(journey => {
            const evidence = inventory.evidence.find(item => item.surface === surface && item.journey === journey);
            const missing: string[] = [];
            if (!evidence?.implementationPaths.length) missing.push("IMPLEMENTATION");
            if (!evidence?.testPaths.length) missing.push("TESTS");
            if (!evidence?.usesDurableData) missing.push("DURABLE_DATA");
            if (!evidence?.authorityAndProvenance) missing.push("PBOS_AUTHORITY_AND_PROVENANCE");
            if (!evidence?.responsive) missing.push("RESPONSIVE_LAYOUT");
            if (!evidence?.accessible) missing.push("ACCESSIBILITY");
            return missing.length ? [this.gap(surface, journey, missing)] : [];
        }));
        const unmappedUnits = inventory.units.filter(unit => !unit.unitId.trim() || unit.paths.length === 0 || unit.journeys.length === 0)
            .map(unit => unit.unitId || "UNIDENTIFIED_UNIT");
        return { repository: inventory.repository, revision: inventory.revision,
            inventory: { routes: inventory.routeCount, tests: inventory.testCount, databaseFiles: inventory.databaseFileCount },
            gaps, unmappedUnits, complete: gaps.length === 0 && unmappedUnits.length === 0, generatedAt: new Date() };
    }

    private gap(surface: ApplicationSurface, journey: ApplicationJourney, missing: readonly string[]): ApplicationReadinessGap {
        const cip = surface === "WEB" ? "CIP-048" : "CIP-049";
        const priority = journey === "IDENTITY_ONBOARDING" || journey === "DASHBOARD" ? "CRITICAL"
            : missing.includes("PBOS_AUTHORITY_AND_PROVENANCE") || missing.includes("DURABLE_DATA") ? "HIGH" : "NORMAL";
        return { gapId: `${cip}-${surface}-${journey}`, cip, journey, surface, priority, missing,
            acceptanceCriteria: [
                `${journey} has production implementation and automated tests on ${surface}.`,
                `${journey} uses durable governed data with PBOS authority and provenance.`,
                `${journey} passes responsive and accessibility validation on ${surface}.`
            ] };
    }
}
