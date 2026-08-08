import { MissionQueueItem } from "../production-runtime";
import { PlaybookCanonProductGraph } from "./playbook-canon-product-graph";

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
            dependencies: ["048-canon-authority"], status: journeyBlocked ? "QUEUED" : "COMPLETE",
            rationale: journeyBlocked ? "The canonical User Journeys authority is empty."
                : "Canonical role and user journeys are available for product planning.",
            approvalRequired: true, evidenceIds: priorEvidence(prior.get("048-canon-journeys")),
            completionPolicy: artifactPolicy(["Every supported role has an ordered, state-complete canonical user journey."])
        }, {
            missionId: "048-canon-design", systemId: SYSTEM_ID, title: "Bind every visible Playbook route to approved design canon",
            dependencies: ["048-canon-authority"], status: unmappedRoutes || undesignedRoutes ? "QUEUED" : "COMPLETE",
            rationale: `${unmappedRoutes} visible routes are unmapped and ${undesignedRoutes} mapped routes lack design-canon IDs.`,
            approvalRequired: true, evidenceIds: priorEvidence(prior.get("048-canon-design")),
            completionPolicy: functionalPolicy(["Every human-facing route and state is mapped to an approved responsive design canon."])
        }];

        const phaseById = new Map(graph.phases.map(phase => [phase.phaseId, phase]));
        Array.from({ length: 15 }, (_, index) => `PHASE-${String(index + 1).padStart(2, "0")}`).forEach(phaseId => {
            const phase = phaseById.get(phaseId) ?? { phaseId, title: `canonical phase ${phaseId.slice(-2)}`,
                completion: 0, incompleteItems: ["Canonical phase definition is missing."] };
            const missionId = `048-phase-${phase.phaseId.slice(-2)}`;
            const complete = phase.completion === 100 && phase.incompleteItems.length === 0;
            items.push({ missionId, systemId: SYSTEM_ID, title: `Complete ${phase.title} from Playbook canon`,
                dependencies: [...new Set(["048-canon-journeys", ...(phaseDependencies[phase.phaseId] ?? ["048-canon-authority"])])],
                status: complete ? "COMPLETE" : "QUEUED",
                rationale: complete ? `${phase.title} is proven complete at ${graph.revision}.`
                    : `${phase.title} is ${phase.completion}% complete with ${phase.incompleteItems.length} unfinished items.`,
                approvalRequired: true, evidenceIds: complete ? priorEvidence(prior.get(missionId)) : [],
                completionPolicy: functionalPolicy([
                    `${phase.title} satisfies every canonical checklist item.`,
                    `${phase.title} passes exact-revision desktop, mobile, accessibility, security, authority, and durable-data acceptance.`
                ]) });
        });

        items.push({ missionId: "048-canon-requirements", systemId: SYSTEM_ID,
            title: "Converge all Playbook intelligence and human-agency requirements",
            dependencies: ["048-phase-03", "048-phase-05", "048-phase-09"],
            status: incompleteRequirements ? "QUEUED" : "COMPLETE",
            rationale: `${incompleteRequirements} of ${graph.requirements.length} traced requirements remain partial or missing.`,
            approvalRequired: true, evidenceIds: priorEvidence(prior.get("048-canon-requirements")),
            completionPolicy: functionalPolicy(["Every traced requirement is implemented and accepted without demo or parallel truth stores."]) });

        const productDependencies = ["048-canon-authority", "048-canon-journeys", "048-canon-design", "048-canon-requirements",
            ...Array.from({ length: 15 }, (_, index) => `048-phase-${String(index + 1).padStart(2, "0")}`)];
        items.push({ missionId: "048-product-journeys", systemId: SYSTEM_ID,
            title: "Certify complete canon-converged Playbook product", dependencies: productDependencies,
            status: graph.certificationReady ? "COMPLETE" : "QUEUED",
            rationale: graph.certificationReady ? "The exact-revision canon graph contains no blockers."
                : `${graph.blockers.length} canon-to-product blockers remain.`, approvalRequired: true,
            evidenceIds: graph.certificationReady ? [`canon-graph:${graph.revision}`] : [],
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
