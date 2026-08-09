import { LaunchCip, LaunchEvidence, LaunchReadinessPlan, LaunchTask, LaunchTaskDefinition } from "./contracts";
import { PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS, PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS } from "../application-readiness/playbook-full-canonical-roadmap";

interface CanonLaunchContext {
    readonly productJourneyIds: readonly string[];
}

const criteria = (...items: string[]): readonly string[] => items;

export const PLAYBOOK_LAUNCH_TASKS: readonly LaunchTaskDefinition[] = [
    { taskId: "046-bulletproof-manifest", cip: "CIP-046", title: "Validate independent Bulletproof connector manifest",
        dependencies: [], gate: "AUTOMATED", acceptanceCriteria: criteria("Bulletproof system, OS, connector, and domain IDs are unique", "No Playbook domain behavior is imported") },
    { taskId: "046-parallel-staging", cip: "CIP-046", title: "Activate Bulletproof beside Playbook in staging",
        dependencies: ["046-bulletproof-manifest"], gate: "HUMAN_APPROVAL", acceptanceCriteria: criteria("Both connectors are active", "Organization state and credentials remain isolated", "Cross-connector requests are denied") },
    { taskId: "046-certification", cip: "CIP-046", title: "Certify multi-system factory proof",
        dependencies: ["046-parallel-staging"], gate: "HUMAN_APPROVAL", acceptanceCriteria: criteria("Independent audit evidence is complete", "Human certification is recorded") },

    { taskId: "047-credential-rotation", cip: "CIP-047", title: "Prove credential rotation and revocation",
        dependencies: [], gate: "HUMAN_APPROVAL", acceptanceCriteria: criteria("Retired key returns 401", "Replacement key returns governed health", "Rotation survives revision replacement") },
    { taskId: "047-backup-restore", cip: "CIP-047", title: "Prove state backup and restoration",
        dependencies: ["047-credential-rotation"], gate: "HUMAN_APPROVAL", acceptanceCriteria: criteria("Versioned backup is immutable", "Restored state matches evidence digest", "Recovery point and recovery time are recorded") },
    { taskId: "047-resilience", cip: "CIP-047", title: "Complete rollback, degraded-mode, load, and failure tests",
        dependencies: ["047-backup-restore"], gate: "HUMAN_APPROVAL", acceptanceCriteria: criteria("Rollback restores known-good digest", "Dependencies fail closed", "Rate and concurrency limits are enforced") },
    { taskId: "047-operations", cip: "CIP-047", title: "Complete monitoring and incident operations",
        dependencies: ["047-resilience"], gate: "EXTERNAL_ACCOUNT", acceptanceCriteria: criteria("Dashboards and alerts are active", "Incident and disaster-recovery exercises pass", "Production is isolated from staging") },

    { taskId: "048-repository-gap-analysis", cip: "CIP-048", title: "Compile Playbook repository gap analysis",
        dependencies: [], gate: "AUTOMATED", acceptanceCriteria: criteria("Every package maps to a user journey or platform service", "Incomplete wiring is identified by revision", "Work packages have testable acceptance criteria") },
    { taskId: "048-foundation", cip: "CIP-048", title: "Complete web identity, authority, data, and design foundations",
        dependencies: ["048-repository-gap-analysis"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Supabase identity is mapped to PBOS", "Role and row-level boundaries pass", "Responsive accessible design system is applied") },
    { taskId: "048-scholar-slice", cip: "CIP-048", title: "Complete Scholar onboarding-to-dashboard slice",
        dependencies: ["048-foundation"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Onboarding persists real data", "Dashboard projects approved data", "Loading, empty, error, and recovery states pass") },
    { taskId: "048-academic-journey", cip: "CIP-048", title: "Complete transcript-to-academic-readiness journey",
        dependencies: ["048-scholar-slice"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("The authenticated Scholar owns every transcript mutation", "Transcript evidence durably produces academic readiness", "Loading, empty, error, recovery, accessibility, security, lint, tests, and production build pass") },
    { taskId: "048-opportunity-journey", cip: "CIP-048", title: "Complete readiness-to-opportunity journey",
        dependencies: ["048-academic-journey"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Approved academic evidence produces explainable opportunity matches", "Saving and dismissing opportunities are durable and owner-scoped") },
    { taskId: "048-application-journey", cip: "CIP-048", title: "Complete opportunity-to-application journey",
        dependencies: ["048-opportunity-journey"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("A Scholar can move an opportunity into a durable application workspace", "Tasks, documents, deadlines, and status survive restart") },
    { taskId: "048-support-journey", cip: "CIP-048", title: "Complete application-to-support journey",
        dependencies: ["048-application-journey"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("A Scholar can request authorized support from the application workspace", "Support access follows role and relationship boundaries") },
    { taskId: "048-messaging-journey", cip: "CIP-048", title: "Complete governed support messaging journey",
        dependencies: ["048-support-journey"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Authorized participants exchange durable messages", "Mute, block, reporting, unread, empty, failure, and recovery states pass") },
    { taskId: "048-notification-journey", cip: "CIP-048", title: "Complete reliable notification journey",
        dependencies: ["048-messaging-journey"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Domain events produce idempotent notifications through a durable outbox", "Preferences, escalation, retry, acknowledgement, and failure evidence pass") },
    { taskId: "048-product-journeys", cip: "CIP-048", title: "Certify connected Playbook product journeys",
        dependencies: ["048-academic-journey", "048-opportunity-journey", "048-application-journey", "048-support-journey", "048-messaging-journey", "048-notification-journey"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Every journey has route, UI, durable-data, authority, integration, and acceptance evidence", "Accessibility, security, lint, tests, and production build pass as one connected system") },
    { taskId: "048-web-staging", cip: "CIP-048", title: "Deploy and accept Playbook web staging",
        dependencies: ["048-product-journeys", "047-operations"], gate: "HUMAN_APPROVAL", acceptanceCriteria: criteria("A commit-bound desktop web URL opens the interactive application", "Stakeholder acceptance passes", "Production configuration contains no staging credentials") },

    { taskId: "049-mobile-foundation", cip: "CIP-049", title: "Generate shared iOS and Android application foundation",
        dependencies: ["048-product-journeys"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Shared contracts and design tokens are reused", "Native secure storage and deep-link boundaries exist", "Platform-specific code remains isolated") },
    { taskId: "049-mobile-journeys", cip: "CIP-049", title: "Complete primary mobile Scholar journeys",
        dependencies: ["049-mobile-foundation", "048-product-journeys"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Authentication, onboarding, dashboard, messaging, documents, and notifications pass on iOS and Android", "Offline and recovery behavior is defined") },
    { taskId: "049-store-readiness", cip: "CIP-049", title: "Prepare Apple and Google store releases",
        dependencies: ["049-mobile-journeys"], gate: "EXTERNAL_ACCOUNT", acceptanceCriteria: criteria("Signing identities and listings are configured", "Privacy disclosures and screenshots are approved", "TestFlight and Play internal testing pass") },
    { taskId: "049-certification", cip: "CIP-049", title: "Certify mobile release candidates",
        dependencies: ["049-store-readiness", "047-operations"], gate: "HUMAN_APPROVAL", acceptanceCriteria: criteria("A commit-bound mobile preview URL opens the interactive application", "iOS and Android release evidence is complete", "Human mobile certification is recorded") },
    { taskId: "050-platform-evidence", cip: "CIP-050", title: "Compile independent multi-platform ecosystem evidence",
        dependencies: ["048-web-staging", "049-certification"], gate: "AUTOMATED", acceptanceCriteria: criteria("Playbook and Bulletproof have independent web, iOS, and Android scorecards", "Every readiness domain has provenance-bearing evidence") },
    { taskId: "050-isolation", cip: "CIP-050", title: "Prove shared PBOS contracts and independent ownership",
        dependencies: ["050-platform-evidence"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Both systems use one PBOS contract version", "Repositories, brands, data boundaries, and release authorities remain independent") },
    { taskId: "050-certification", cip: "CIP-050", title: "Issue separate human ecosystem certifications",
        dependencies: ["050-isolation"], gate: "HUMAN_APPROVAL", acceptanceCriteria: criteria("Mission Control renders separate Open desktop web app and Open mobile app actions", "Playbook certification is independently approved", "Bulletproof certification is independently approved", "Public web and store submissions retain separate approvals") }
];

const journeyTaskByJourneyId: Readonly<Record<string, string>> = {
    "SCHOLAR-ONBOARDING-TO-DASHBOARD": "048-scholar-slice",
    "TRANSCRIPT-TO-ACADEMIC-READINESS": "048-academic-journey",
    "READINESS-TO-OPPORTUNITY": "048-opportunity-journey",
    "OPPORTUNITY-TO-APPLICATION": "048-application-journey",
    "APPLICATION-TO-AUTHORIZED-SUPPORT": "048-support-journey",
    "AUTHORIZED-SUPPORT-MESSAGING": "048-messaging-journey",
    "EVENT-TO-ACKNOWLEDGED-NOTIFICATION": "048-notification-journey"
};

const launchTaskById = new Map(PLAYBOOK_LAUNCH_TASKS.map(task => [task.taskId, task]));
const staticOrder = new Map(PLAYBOOK_LAUNCH_TASKS.map((task, index) => [task.taskId, index]));
const REQUIRED_LAUNCH_TASK_IDS = [
    "048-product-journeys",
    "048-web-staging",
    "049-mobile-foundation",
    "049-mobile-journeys",
    "049-store-readiness",
    "049-certification",
    "050-platform-evidence",
    "050-isolation",
    "050-certification"
] as const;

function assertTask(taskId: string): LaunchTaskDefinition {
    const task = launchTaskById.get(taskId);
    if (!task) throw new Error(`Missing static launch task definition: ${taskId}`);
    return task;
}

function deriveLaunchTasks(canon?: CanonLaunchContext): readonly LaunchTaskDefinition[] {
    const activeCanon = canon ?? { productJourneyIds: PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS };

    const journeyTaskIds = activeCanon.productJourneyIds.map(journeyId => {
        const taskId = journeyTaskByJourneyId[journeyId];
        if (taskId) return taskId;
        if (journeyId.startsWith("ONBOARDING-")) return `048-onboarding-${journeyId.slice("ONBOARDING-".length).toLowerCase()}`;
        if (journeyId.startsWith("OS-")) return `048-os-${journeyId.slice("OS-".length).toLowerCase()}`;
        throw new Error(`Unsupported canonical product journey for launch planning: ${journeyId}`);
    });
    if (!journeyTaskIds.length) {
        throw new Error("Canonical launch planning requires at least one declared product journey ID.");
    }
    if (new Set(journeyTaskIds).size !== journeyTaskIds.length) {
        throw new Error("Canonical launch planning requires unique product journey IDs.");
    }

    const onboardingIds = new Set(PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS
        .map(item => item.pathwayId.replaceAll("_", "-").toLowerCase()));
    const canonicalDefinitions = journeyTaskIds.map(taskId => {
        const staticTask = launchTaskById.get(taskId);
        if (staticTask) return staticTask;
        if (taskId.startsWith("048-onboarding-")) {
            return { taskId, cip: "CIP-048" as const, title: `Complete ${taskId.slice("048-onboarding-".length)} onboarding`,
                dependencies: ["048-foundation"], gate: "HUMAN_VALIDATION" as const,
                acceptanceCriteria: criteria("Role-specific onboarding persists canonical identity and records",
                    "Verification, authority, recovery, desktop, and mobile acceptance pass") };
        }
        const osId = taskId.slice("048-os-".length);
        const onboardingId = onboardingIds.has(osId) ? `048-onboarding-${osId}` : "048-foundation";
        return { taskId, cip: "CIP-048" as const, title: `Complete ${osId} operating system`,
            dependencies: [onboardingId], gate: "HUMAN_VALIDATION" as const,
            acceptanceCriteria: criteria("Role-specific OS navigation, data, actions, and authority are functional",
                "Responsive design, accessibility, security, recovery, desktop, and mobile acceptance pass") };
    });
    const uniqueCanonicalDefinitions = canonicalDefinitions.filter((task, index, tasks) =>
        tasks.findIndex(candidate => candidate.taskId === task.taskId) === index);
    const dynamicCip048 = [
        assertTask("048-repository-gap-analysis"),
        assertTask("048-foundation"),
        ...uniqueCanonicalDefinitions,
        { ...assertTask("048-product-journeys"), dependencies: [...new Set(journeyTaskIds)] },
        assertTask("048-web-staging")
    ];

    const taskIdsInOrder = new Set(dynamicCip048.map(task => task.taskId));
    const remaining = PLAYBOOK_LAUNCH_TASKS.filter(task => task.cip !== "CIP-048" && !taskIdsInOrder.has(task.taskId));
    return [...PLAYBOOK_LAUNCH_TASKS.filter(task => ["CIP-046", "CIP-047"].includes(task.cip)), ...dynamicCip048, ...remaining];
}

export function playbookLaunchTaskDefinitions(options?: Readonly<{ canon?: CanonLaunchContext }>): readonly LaunchTaskDefinition[] {
    const tasks = deriveLaunchTasks(options?.canon);
    const taskIds = new Set(tasks.map(task => task.taskId));
    const missing = REQUIRED_LAUNCH_TASK_IDS.filter(taskId => !taskIds.has(taskId));
    if (missing.length) {
        throw new Error(`Launch task definition is missing required readiness tasks: ${missing.join(", ")}`);
    }
    return tasks;
}

function launchOrder(tasks: readonly LaunchTaskDefinition[]): ReadonlyMap<string, number> {
    return new Map(tasks.map((task, index) => [task.taskId, index]));
}

export class PlaybookLaunchPlanCompiler {
    compile(evidence: readonly LaunchEvidence[], options?: Readonly<{ canon?: CanonLaunchContext }>): LaunchReadinessPlan {
        const taskDefinitions = playbookLaunchTaskDefinitions(options);
        const order = launchOrder(taskDefinitions);
        const valid = new Map<string, string[]>();
        for (const task of taskDefinitions) {
            const candidates = evidence.filter(item => item.taskId === task.taskId && this.validEvidence(item, task));
            const proven = new Set(candidates.flatMap(item => item.acceptanceCriteria));
            if (task.acceptanceCriteria.every(criterion => proven.has(criterion))) {
                valid.set(task.taskId, candidates.map(item => item.evidenceId));
            }
        }
        const complete = new Set<string>();
        let advanced = true;
        while (advanced) {
            advanced = false;
            for (const task of taskDefinitions) {
                if (!valid.has(task.taskId) || complete.has(task.taskId)) continue;
                if (task.dependencies.every(dependency => complete.has(dependency))) {
                    complete.add(task.taskId);
                    advanced = true;
                }
            }
        }
        const tasks: LaunchTask[] = taskDefinitions.map(task => {
            const blockedBy = task.dependencies.filter(dependency => !complete.has(dependency));
            return { ...task, evidenceIds: valid.get(task.taskId) ?? [], blockedBy,
                state: complete.has(task.taskId) ? "COMPLETE" : blockedBy.length ? "BLOCKED" : "READY" };
        });
        const nextTask = tasks.filter(task => task.state === "READY")
            .sort((left, right) => (order.get(left.taskId) ?? staticOrder.get(left.taskId) ?? 0)
                - (order.get(right.taskId) ?? staticOrder.get(right.taskId) ?? 0))[0];
        return { systemId: "PLAYBOOK-SYSTEM-001", tasks, nextTask,
            readyForPublicLaunch: tasks.every(task => task.state === "COMPLETE") };
    }

    byCip(plan: LaunchReadinessPlan, cip: LaunchCip): readonly LaunchTask[] {
        return plan.tasks.filter(task => task.cip === cip);
    }

    private validEvidence(evidence: LaunchEvidence, task: LaunchTaskDefinition): boolean {
        if (!evidence.valid || !evidence.evidenceId.trim() || !evidence.artifact.trim() || !evidence.repository.includes("/") ||
            !/^[a-f0-9]{7,40}$/i.test(evidence.commit)) return false;
        const acceptedTypes: Readonly<Record<LaunchTaskDefinition["gate"], readonly LaunchEvidence["evidenceType"][]>> = {
            AUTOMATED: ["PLATFORM_ARTIFACT", "FUNCTIONAL_ACCEPTANCE"],
            HUMAN_VALIDATION: ["FUNCTIONAL_ACCEPTANCE"],
            HUMAN_APPROVAL: ["HUMAN_APPROVAL"],
            EXTERNAL_ACCOUNT: ["EXTERNAL_PROOF"]
        };
        const acceptedEvidenceType = task.taskId === "050-isolation"
            ? evidence.evidenceType === "PLATFORM_ARTIFACT"
            : acceptedTypes[task.gate].includes(evidence.evidenceType);
        if (!acceptedEvidenceType) return false;
        return evidence.evidenceType !== "HUMAN_APPROVAL" || Boolean(evidence.approvalId?.trim());
    }
}
