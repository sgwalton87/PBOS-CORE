import { LaunchCip, LaunchEvidence, LaunchReadinessPlan, LaunchTask, LaunchTaskDefinition } from "./contracts";

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
    { taskId: "048-product-journeys", cip: "CIP-048", title: "Complete connected Playbook journeys",
        dependencies: ["048-scholar-slice"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Academic, opportunity, application, support, messaging, and notification journeys are connected", "Accessibility, security, lint, tests, and production build pass") },
    { taskId: "048-web-staging", cip: "CIP-048", title: "Deploy and accept Playbook web staging",
        dependencies: ["048-product-journeys", "047-operations"], gate: "HUMAN_APPROVAL", acceptanceCriteria: criteria("Stakeholder acceptance passes", "Production configuration contains no staging credentials") },

    { taskId: "049-mobile-foundation", cip: "CIP-049", title: "Generate shared iOS and Android application foundation",
        dependencies: ["048-foundation"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Shared contracts and design tokens are reused", "Native secure storage and deep-link boundaries exist", "Platform-specific code remains isolated") },
    { taskId: "049-mobile-journeys", cip: "CIP-049", title: "Complete primary mobile Scholar journeys",
        dependencies: ["049-mobile-foundation", "048-product-journeys"], gate: "HUMAN_VALIDATION", acceptanceCriteria: criteria("Authentication, onboarding, dashboard, messaging, documents, and notifications pass on iOS and Android", "Offline and recovery behavior is defined") },
    { taskId: "049-store-readiness", cip: "CIP-049", title: "Prepare Apple and Google store releases",
        dependencies: ["049-mobile-journeys"], gate: "EXTERNAL_ACCOUNT", acceptanceCriteria: criteria("Signing identities and listings are configured", "Privacy disclosures and screenshots are approved", "TestFlight and Play internal testing pass") },
    { taskId: "049-certification", cip: "CIP-049", title: "Certify mobile release candidates",
        dependencies: ["049-store-readiness", "047-operations"], gate: "HUMAN_APPROVAL", acceptanceCriteria: criteria("iOS and Android release evidence is complete", "Human mobile certification is recorded") }
];

const order = new Map(PLAYBOOK_LAUNCH_TASKS.map((task, index) => [task.taskId, index]));

export class PlaybookLaunchPlanCompiler {
    compile(evidence: readonly LaunchEvidence[]): LaunchReadinessPlan {
        const valid = new Map<string, string[]>();
        for (const item of evidence.filter(item => item.valid)) valid.set(item.taskId, [...(valid.get(item.taskId) ?? []), item.evidenceId]);
        const complete = new Set(valid.keys());
        const tasks: LaunchTask[] = PLAYBOOK_LAUNCH_TASKS.map(task => {
            const blockedBy = task.dependencies.filter(dependency => !complete.has(dependency));
            return { ...task, evidenceIds: valid.get(task.taskId) ?? [], blockedBy,
                state: complete.has(task.taskId) ? "COMPLETE" : blockedBy.length ? "BLOCKED" : "READY" };
        });
        const nextTask = tasks.filter(task => task.state === "READY")
            .sort((left, right) => (order.get(left.taskId) ?? 0) - (order.get(right.taskId) ?? 0))[0];
        return { systemId: "PLAYBOOK-SYSTEM-001", tasks, nextTask,
            readyForPublicLaunch: tasks.every(task => task.state === "COMPLETE") };
    }

    byCip(plan: LaunchReadinessPlan, cip: LaunchCip): readonly LaunchTask[] {
        return plan.tasks.filter(task => task.cip === cip);
    }
}
