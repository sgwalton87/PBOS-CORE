import { MissionQueueItem } from "../production-runtime";
import { PlaybookCanonProductGraph } from "./playbook-canon-product-graph";
import { PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS, playbookCanonChecklistItemMissionId } from "./playbook-full-canonical-roadmap";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";

const functionalPolicy = (criteria: readonly string[]): MissionQueueItem["completionPolicy"] => ({
    kind: "FUNCTIONAL_APPLICATION",
    requiredDimensions: ["ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION",
        "ACCEPTANCE_TEST", "ACCESSIBILITY", "SECURITY", "INDEPENDENT_VALIDATION"],
    acceptanceCriteria: criteria
});

const artifactPolicy = (criteria: readonly string[]): MissionQueueItem["completionPolicy"] => ({
    kind: "PLATFORM_ARTIFACT", requiredDimensions: [], acceptanceCriteria: criteria
});

const phaseDependencies: Readonly<Record<string, readonly string[]>> = {
    "PHASE-01": ["048-canon-authority", "048-canon-design"],
    "PHASE-02": ["048-phase-01"],
    "PHASE-03": ["048-phase-02"],
    "PHASE-04": ["048-phase-02", "048-phase-03"],
    "PHASE-05": ["048-phase-03", "048-phase-04"],
    "PHASE-06": ["048-phase-03", "048-phase-05"],
    "PHASE-07": ["048-phase-05"],
    "PHASE-08": ["048-phase-04"],
    "PHASE-09": ["048-phase-02", "048-phase-08"],
    "PHASE-10": ["048-phase-03", "048-phase-05", "048-phase-09"],
    "PHASE-11": ["048-phase-05"],
    "PHASE-12": ["048-phase-05", "048-phase-09"],
    "PHASE-13": ["048-phase-04", "048-phase-05", "048-phase-10"],
    "PHASE-14": ["048-phase-01", "048-phase-04"],
    "PHASE-15": Array.from({ length: 14 }, (_, index) => `048-phase-${String(index + 1).padStart(2, "0")}`)
};

function priorEvidence(prior: MissionQueueItem | undefined): readonly string[] { return prior?.evidenceIds ?? []; }
const missionSegment = (value: string): string => value.toLowerCase().replaceAll("_", "-");
const requirementMissionId = (value: string): string => `048-requirement-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

function blockerValues(blockers: readonly string[], prefix: string): readonly string[] {
    return blockers.filter(blocker => blocker.startsWith(prefix)).map(blocker => blocker.slice(prefix.length));
}

function summarize(values: readonly string[], max = 3): string {
    if (!values.length) return "";
    if (values.length <= max) return values.join(", ");
    return `${values.slice(0, max).join(", ")} (+${values.length - max} more)`;
}

interface DomainHotspotDefinition {
    readonly id: string;
    readonly label: string;
    readonly matcher: RegExp;
    readonly missionTitle: string;
    readonly acceptanceCriteria: readonly string[];
}

const DOMAIN_HOTSPOTS: readonly DomainHotspotDefinition[] = [{
    id: "compass",
    label: "Compass",
    matcher: /\bcompass\b/i,
    missionTitle: "Compass readiness package",
    acceptanceCriteria: [
        "Compass signals are durable, explainable, and role-scoped for governed Scholar outcomes.",
        "Compass UI/UX states satisfy canonical design, accessibility, and security acceptance on exact revision."
    ]
}, {
    id: "newsfeed",
    label: "Newsfeed",
    matcher: /\b(feed|newsfeed)\b/i,
    missionTitle: "Newsfeed readiness package",
    acceptanceCriteria: [
        "Newsfeed events are idempotent, durable, and authority-scoped for each role pathway.",
        "Newsfeed UI states satisfy canonical design, accessibility, and recovery acceptance on exact revision."
    ]
}, {
    id: "messaging",
    label: "Messaging",
    matcher: /\bmessage|messaging\b/i,
    missionTitle: "Messaging readiness package",
    acceptanceCriteria: [
        "Governed messaging enforces participant authority, moderation, and durable conversation state.",
        "Messaging journey passes route, data, security, accessibility, and independent validation acceptance."
    ]
}, {
    id: "onboarding",
    label: "Onboarding",
    matcher: /\bonboard/i,
    missionTitle: "Onboarding role-pathway readiness package",
    acceptanceCriteria: [
        "Role-specific onboarding pathways persist canonical profile, permissions, and OS landing continuity.",
        "Onboarding recovery and cross-device continuity pass exact-revision acceptance evidence."
    ]
}, {
    id: "starting-5",
    label: "Starting 5 support",
    matcher: /\bstarting\s*5|support network|supporter\b/i,
    missionTitle: "Starting 5 onboarding persistence package",
    acceptanceCriteria: [
        "Starting 5 invitations can be issued from onboarding and persist into governed Scholar runtime state.",
        "Support relationship authority, messaging integration, and recovery states pass exact-revision acceptance."
    ]
}, {
    id: "store",
    label: "Store readiness",
    matcher: /\btestflight|google play|store\b/i,
    missionTitle: "Store wiring package",
    acceptanceCriteria: [
        "TestFlight and Google Play internal release wiring is commit-bound and evidence-backed.",
        "Store metadata, privacy disclosures, signing, and submission checkpoints pass governed acceptance."
    ]
}];

type CanonRequirement = PlaybookCanonProductGraph["requirements"][number];

function unresolvedRequirements(requirements: readonly CanonRequirement[]): readonly CanonRequirement[] {
    return requirements.filter(requirement => requirement.status !== "IMPLEMENTED");
}

function requirementSpotlight(requirements: readonly CanonRequirement[]): string {
    const unresolved = unresolvedRequirements(requirements);
    const labels = DOMAIN_HOTSPOTS
        .filter(hotspot => unresolved.some(requirement => hotspot.matcher.test(requirement.requirement)))
        .map(hotspot => hotspot.label);
    return labels.length ? ` Priority domains blocked: ${labels.join(", ")}.` : "";
}

function domainHotspotPackages(requirements: readonly CanonRequirement[]): ReadonlyArray<Readonly<{
    definition: DomainHotspotDefinition;
    requirements: readonly CanonRequirement[];
}>> {
    const unresolved = unresolvedRequirements(requirements);
    return DOMAIN_HOTSPOTS.flatMap(definition => {
        const matches = unresolved.filter(requirement => definition.matcher.test(requirement.requirement));
        return matches.length ? [{ definition, requirements: matches }] : [];
    });
}

/** Turns the exact-revision canon graph into the only product queue PBOS may execute. */
export class PlaybookCanonMissionPlanner {
    compile(graph: PlaybookCanonProductGraph, previous: readonly MissionQueueItem[] = []): readonly MissionQueueItem[] {
        if (graph.repository !== "sgwalton87/playbook-platform" || !/^[a-f0-9]{7,40}$/i.test(graph.revision)) {
            throw new Error("Canon mission planning requires the exact governed Playbook revision.");
        }
        const prior = new Map(previous.map(item => [item.missionId, item]));
        const sourceBlocked = graph.blockers.some(blocker => blocker.startsWith("CANON_SOURCE_"));
        const journeyBlocked = graph.blockers.includes("CANON_USER_JOURNEYS_EMPTY");
        const unmappedRoutes = graph.routes.filter(route => route.canonStatus === "UNMAPPED").length;
        const undesignedRoutes = graph.routes.filter(route => route.canonStatus === "MAPPED" && !route.designCanonIds.length).length;
        const incompleteRequirements = graph.requirements.filter(requirement => requirement.status !== "IMPLEMENTED").length;
        const roleJourneyIncomplete = blockerValues(graph.blockers, "ROLE_JOURNEY_INCOMPLETE:")
            .map(value => { const [role, status] = value.split(":"); return `${role} (${status})`; });
        const roleOsUnmapped = blockerValues(graph.blockers, "ROLE_OS_ROUTE_UNMAPPED:")
            .map(value => { const [role, route] = value.split(":"); return `${role} -> ${route}`; });
        const roleOsOutOfScope = blockerValues(graph.blockers, "ROLE_OS_ROUTE_NOT_DECLARED_IN_OS_SCOPE:")
            .map(value => { const [role, route] = value.split(":"); return `${role} -> ${route}`; });
        const roleOsUndesigned = blockerValues(graph.blockers, "ROLE_OS_ROUTE_DESIGN_CANON_MISSING:")
            .map(value => { const [role, route] = value.split(":"); return `${role} -> ${route}`; });
        const osScopeUnavailable = graph.blockers.includes("CANON_OS_SCOPE_ROUTES_UNAVAILABLE");
        const roleJourneysUnavailable = graph.blockers.includes("CANON_ROLE_JOURNEYS_UNAVAILABLE");
        const journeyTopologyComplete = !journeyBlocked && !roleJourneysUnavailable
            && PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS.every(journeyId => graph.productJourneyIds.includes(journeyId))
            && graph.onboardingPathways.length >= 14;
        const roleRouteIssues = roleOsUnmapped.length + roleOsOutOfScope.length + roleOsUndesigned.length;

        const items: MissionQueueItem[] = [{
            missionId: "048-canon-authority", systemId: SYSTEM_ID, title: "Converge Playbook canonical authority",
            dependencies: [], status: sourceBlocked ? "QUEUED" : "COMPLETE",
            rationale: sourceBlocked ? "Canonical authority sources are missing or empty."
                : `${graph.sources.length} canonical entry sources are digest-bound to ${graph.revision}.`,
            approvalRequired: false, evidenceIds: sourceBlocked ? priorEvidence(prior.get("048-canon-authority"))
                : [`canon-graph:${graph.revision}`, ...graph.sources.map(source => `sha256:${source.sha256}`)],
            completionPolicy: artifactPolicy(["Every canonical authority source is present, nonempty, and digest-bound."])
        }, {
            missionId: "048-canon-journeys", systemId: SYSTEM_ID, title: "Compile complete Playbook role and user journeys",
            dependencies: ["048-canon-authority"], status: journeyTopologyComplete ? "COMPLETE" : "QUEUED",
            rationale: !journeyTopologyComplete
                ? `Role/user journey topology is incomplete.${journeyBlocked ? " User Journeys is empty." : ""}`
                    + `${roleJourneysUnavailable ? " Role journey index is missing." : ""}`
                    + `${roleJourneyIncomplete.length ? ` Incomplete roles: ${summarize(roleJourneyIncomplete)}.` : ""}`
                : `All required OS/onboarding journey contracts are declared; ${roleJourneyIncomplete.length} incomplete role implementations remain delegated to explicit functional missions.`,
            approvalRequired: true, evidenceIds: priorEvidence(prior.get("048-canon-journeys")),
            completionPolicy: artifactPolicy(["Every required role and OS has an ordered canonical journey contract with gaps represented explicitly."])
        }, {
            missionId: "048-canon-design", systemId: SYSTEM_ID, title: "Bind every visible Playbook route to approved design canon",
            dependencies: ["048-canon-authority"], status: unmappedRoutes || undesignedRoutes || roleRouteIssues || osScopeUnavailable ? "QUEUED" : "COMPLETE",
            rationale: `${unmappedRoutes} visible routes are unmapped and ${undesignedRoutes} mapped routes lack design-canon IDs.`
                + `${roleOsUnmapped.length ? ` Role OS routes unmapped: ${summarize(roleOsUnmapped)}.` : ""}`
                + `${roleOsUndesigned.length ? ` Role OS routes missing design canon: ${summarize(roleOsUndesigned)}.` : ""}`
                + `${roleOsOutOfScope.length ? ` Role OS routes outside declared OS scope: ${summarize(roleOsOutOfScope)}.` : ""}`
                + `${osScopeUnavailable ? " Canonical OS scope routes are unavailable." : ""}`,
            approvalRequired: true, evidenceIds: priorEvidence(prior.get("048-canon-design")),
            completionPolicy: artifactPolicy(["Every human-facing route and state is mapped to an approved responsive design target without inferring implementation."])
        }];

        const phaseById = new Map(graph.phases.map(phase => [phase.phaseId, phase]));
        Array.from({ length: 15 }, (_, index) => `PHASE-${String(index + 1).padStart(2, "0")}`).forEach(phaseId => {
            const phase = phaseById.get(phaseId) ?? { phaseId, title: `canonical phase ${phaseId.slice(-2)}`,
                completion: 0, incompleteItems: ["Canonical phase definition is missing."] };
            const missionId = `048-phase-${phase.phaseId.slice(-2)}`;
            const complete = phase.completion === 100 && phase.incompleteItems.length === 0;
            const baseDependencies = [...new Set(["048-canon-journeys", ...(phaseDependencies[phase.phaseId] ?? ["048-canon-authority"])])];
            const itemMissionIds = phase.incompleteItems.map(item => playbookCanonChecklistItemMissionId(phase.phaseId, item));
            phase.incompleteItems.forEach((item, itemIndex) => {
                const itemMissionId = itemMissionIds[itemIndex];
                items.push({ missionId: itemMissionId, systemId: SYSTEM_ID,
                    title: `Complete ${phase.title} item: ${item}`,
                    dependencies: baseDependencies, status: "QUEUED",
                    rationale: `${item} remains unfinished in ${phase.phaseId} at ${graph.revision}.`,
                    approvalRequired: true, evidenceIds: priorEvidence(prior.get(itemMissionId)),
                    completionPolicy: functionalPolicy([
                        `${item} is functionally complete without claiming completion of other ${phase.title} items.`,
                        `${item} passes exact-revision route, UI, durable-data, authority, integration, accessibility, security, desktop, and mobile acceptance.`
                    ]) });
            });
            items.push({ missionId, systemId: SYSTEM_ID, title: `${complete ? "Complete" : "Advance"} ${phase.title} from Playbook canon`,
                dependencies: [...baseDependencies, ...itemMissionIds],
                status: complete ? "COMPLETE" : "QUEUED",
                rationale: complete ? `${phase.title} is proven complete at ${graph.revision}.`
                    : `${phase.title} is ${phase.completion}% complete with ${phase.incompleteItems.length} unfinished items.`,
                approvalRequired: true, evidenceIds: complete ? priorEvidence(prior.get(missionId)) : [],
                completionPolicy: artifactPolicy([`${phase.title} satisfies every canonical checklist item and its calculated completion is 100%.`]) });
        });

        items.push({ missionId: "048-canon-requirements", systemId: SYSTEM_ID,
            title: "Compile all Playbook intelligence and human-agency requirements",
            dependencies: ["048-phase-03", "048-phase-05", "048-phase-09"],
            status: graph.requirements.length ? "COMPLETE" : "QUEUED",
            rationale: `${graph.requirements.length} requirements are indexed; ${incompleteRequirements} remain partial or missing and are delegated to explicit functional missions.`
                + requirementSpotlight(graph.requirements),
            approvalRequired: true, evidenceIds: priorEvidence(prior.get("048-canon-requirements")),
            completionPolicy: artifactPolicy(["Every traced requirement has a stable ID, status, source, and explicit implementation mission when unresolved."]) });

        const requirementPackages = unresolvedRequirements(graph.requirements).map(requirement => {
            const missionId = requirementMissionId(requirement.requirementId);
            items.push({ missionId, systemId: SYSTEM_ID, title: `Complete ${requirement.requirementId}: ${requirement.requirement}`,
                dependencies: ["048-canon-requirements"], status: "QUEUED",
                rationale: `${requirement.requirementId} is ${requirement.status} in ${requirement.sourcePath}.`,
                approvalRequired: true, evidenceIds: priorEvidence(prior.get(missionId)),
                completionPolicy: functionalPolicy([
                    `${requirement.requirementId} is implemented through the existing canonical architecture without demo or parallel truth stores.`,
                    `${requirement.requirementId} passes exact-revision functional, authority, durable-data, accessibility, security, desktop, and mobile acceptance.`
                ]) });
            return { requirement, missionId };
        });

        const hotspotPackages = domainHotspotPackages(graph.requirements);
        hotspotPackages.forEach(({ definition, requirements }) => {
            const missionId = `048-domain-${definition.id}`;
            items.push({ missionId, systemId: SYSTEM_ID,
                title: definition.missionTitle,
                dependencies: requirements.map(requirement => requirementMissionId(requirement.requirementId)),
                status: "QUEUED",
                rationale: `${definition.label} remains unresolved in canonical requirements: ${requirements.map(requirement => requirement.requirementId).join(", ")}.`,
                approvalRequired: true,
                evidenceIds: priorEvidence(prior.get(missionId)),
                completionPolicy: functionalPolicy(definition.acceptanceCriteria) });
        });

        const onboardingMissionByOs = new Map<string, string>();
        graph.onboardingPathways.forEach(pathway => {
            const missionId = `048-onboarding-${missionSegment(pathway.pathwayId)}`;
            onboardingMissionByOs.set(pathway.operatingSystemId, missionId);
            const priorMission = prior.get(missionId);
            const sourceComplete = ["COMPLETE", "IMPLEMENTED", "VERIFIED", "CERTIFIED"].includes(pathway.status);
            const evidenceIds = priorEvidence(priorMission);
            items.push({ missionId, systemId: SYSTEM_ID, title: `Complete ${pathway.label}`,
                dependencies: ["048-canon-authority", "048-canon-journeys", "048-canon-design", "048-phase-01"],
                status: sourceComplete && priorMission?.status === "COMPLETE" && evidenceIds.length ? "COMPLETE" : "QUEUED",
                rationale: sourceComplete
                    ? `${pathway.label} is declared complete in canon but still requires exact-revision PBOS acceptance lineage.`
                    : `${pathway.label} is ${pathway.status}; implement role selection, durable onboarding, verification, authority, record projection, OS landing, recovery, and responsive acceptance.`,
                approvalRequired: true, evidenceIds,
                completionPolicy: functionalPolicy([
                    `${pathway.label} completes from public role selection through durable role-specific record projection.`,
                    `${pathway.label} enforces verification, consent, least privilege, recovery, and exact-revision desktop/mobile acceptance.`
                ]) });
        });

        graph.operatingSystems.forEach(operatingSystem => {
            const missionId = `048-os-${missionSegment(operatingSystem.osId)}`;
            const priorMission = prior.get(missionId);
            const evidenceIds = priorEvidence(priorMission);
            const implementationReady = operatingSystem.routeImplemented && operatingSystem.routeMapped && operatingSystem.designBound;
            const onboardingDependency = onboardingMissionByOs.get(operatingSystem.osId);
            items.push({ missionId, systemId: SYSTEM_ID, title: `Complete ${operatingSystem.label}`,
                dependencies: ["048-canon-authority", "048-canon-journeys", "048-canon-design",
                    ...(onboardingDependency ? [onboardingDependency] : [])],
                status: implementationReady && priorMission?.status === "COMPLETE" && evidenceIds.length ? "COMPLETE" : "QUEUED",
                rationale: `${operatingSystem.label} at ${operatingSystem.route}: route ${operatingSystem.routeImplemented ? "present" : "missing"}, ` +
                    `canonical mapping ${operatingSystem.routeMapped ? "present" : "missing"}, design binding ${operatingSystem.designBound ? "present" : "missing"}. ` +
                    "PBOS functional acceptance lineage is required independently for this OS identity.",
                approvalRequired: true, evidenceIds,
                completionPolicy: functionalPolicy([
                    `${operatingSystem.label} renders role-specific navigation, data, actions, permissions, and recovery at ${operatingSystem.route}.`,
                    `${operatingSystem.label} passes durable-data, negative-authority, accessibility, security, desktop, and mobile acceptance on one exact revision.`
                ]) });
        });

        const productDependencies = ["048-canon-authority", "048-canon-journeys", "048-canon-design", "048-canon-requirements",
            ...Array.from({ length: 15 }, (_, index) => `048-phase-${String(index + 1).padStart(2, "0")}`),
            ...requirementPackages.map(item => item.missionId),
            ...hotspotPackages.map(packageMission => `048-domain-${packageMission.definition.id}`),
            ...graph.onboardingPathways.map(pathway => `048-onboarding-${missionSegment(pathway.pathwayId)}`),
            ...graph.operatingSystems.map(operatingSystem => `048-os-${missionSegment(operatingSystem.osId)}`)];
        const priorProduct = prior.get("048-product-journeys");
        const priorProductEvidence = priorEvidence(priorProduct);
        const productCertified = graph.certificationReady && priorProduct?.status === "COMPLETE"
            && priorProductEvidence.some(evidenceId => evidenceId.startsWith("approval:"));
        items.push({ missionId: "048-product-journeys", systemId: SYSTEM_ID,
            title: "Certify complete canon-converged Playbook product", dependencies: productDependencies,
            status: productCertified ? "COMPLETE" : "QUEUED",
            rationale: graph.certificationReady ? "The exact-revision canon graph contains no blockers; full-product functional acceptance and certification remain required."
                : `${graph.blockers.length} canon-to-product blockers remain.`, approvalRequired: true,
            evidenceIds: productCertified ? priorProductEvidence : [],
            completionPolicy: functionalPolicy(["The exact-revision canon graph contains no required missing, partial, stale, or unbound node."]) });

        const retained = ["048-web-staging", "049-mobile-foundation", "049-mobile-journeys", "049-store-readiness",
            "049-certification", "050-platform-evidence", "050-isolation", "050-certification"];
        const dependency: Readonly<Record<string, readonly string[]>> = {
            "048-web-staging": ["048-product-journeys"], "049-mobile-foundation": ["048-product-journeys"],
            "049-mobile-journeys": ["049-mobile-foundation"], "049-store-readiness": ["049-mobile-journeys"],
            "049-certification": ["049-store-readiness", "048-web-staging"], "050-platform-evidence": ["049-certification"],
            "050-isolation": ["050-platform-evidence"], "050-certification": ["050-isolation"]
        };
        retained.forEach(missionId => {
            const old = prior.get(missionId);
            items.push({ missionId, systemId: SYSTEM_ID, title: old?.title ?? missionId,
                dependencies: dependency[missionId] ?? ["048-product-journeys"], status: "QUEUED",
                rationale: missionId === "048-web-staging" && old?.executionBlocker
                    ? `Prior Preview retained as defect evidence: ${old.executionBlocker}` : "Waiting for canon-converged product evidence.",
                approvalRequired: true, evidenceIds: old?.evidenceIds ?? [], completionPolicy: old?.completionPolicy });
        });
        return items;
    }
}
