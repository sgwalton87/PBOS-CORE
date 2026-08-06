import { DISTRIBUTED_PLATFORM_NODE_IDS, DistributedPlatformNode, DistributedPlatformNodeId,
    DistributedPlatformReport, PlatformHealth, PlatformValidationEvidence, PlatformValidationScope } from "./contracts";

const BOTH = ["FUNCTIONAL_ACCEPTANCE", "PRODUCTION_RELEASE"] as const;
const PRODUCTION = ["PRODUCTION_RELEASE"] as const;
const ALL = ["FUNCTIONAL_ACCEPTANCE", "PRODUCTION_RELEASE", "CONTINUOUS"] as const;

const dependency = (nodeId: DistributedPlatformNodeId,
    scopes: readonly PlatformValidationScope[] = BOTH) => ({ nodeId, scopes });

export const CANONICAL_DISTRIBUTED_PLATFORM_NODES: readonly DistributedPlatformNode[] = [
    { nodeId: "CONSTITUTION", layer: "Constitution", canonicalPlatforms: ["PBS", "PPS"],
        responsibility: "Platform governance and engineering authority.",
        validates: ["inheritance", "dependencies", "versioning"], dependencies: [], requiredFor: ALL },
    { nodeId: "SOURCE_CONTROL", layer: "Source Control", canonicalPlatforms: ["GitHub"],
        responsibility: "Source, history, branches, Actions, and releases.",
        validates: ["repository integrity", "branch protection", "CI", "secret references"],
        dependencies: [dependency("CONSTITUTION", ALL)], requiredFor: ALL },
    { nodeId: "BUILD_OS", layer: "Build OS", canonicalPlatforms: ["PBOS"],
        responsibility: "Planning, execution, validation, certification, and Mission Control.",
        validates: ["runtime state", "missions", "evidence", "certification"],
        dependencies: [dependency("SOURCE_CONTROL", ALL)], requiredFor: ALL },
    { nodeId: "SECRETS", layer: "Secrets", canonicalPlatforms: ["GitHub Secrets", "Vercel", "Supabase Secrets"],
        responsibility: "Protected environment configuration.",
        validates: ["presence", "scope", "rotation", "usage without values"],
        dependencies: [dependency("CONSTITUTION", ALL), dependency("SOURCE_CONTROL", ALL)], requiredFor: ALL },
    { nodeId: "DATA_PLATFORM", layer: "Data Platform", canonicalPlatforms: ["Supabase"],
        responsibility: "Authentication, PostgreSQL, RLS, Storage, Realtime, and Edge Functions.",
        validates: ["schema", "migrations", "authentication", "storage", "policies"],
        dependencies: [dependency("BUILD_OS", ALL), dependency("SECRETS", ALL)], requiredFor: ALL },
    { nodeId: "CLOUD_IDENTITY", layer: "Cloud Identity", canonicalPlatforms: ["Google Cloud"],
        responsibility: "OAuth, APIs, IAM, service accounts, and Google integrations.",
        validates: ["OAuth callbacks", "enabled APIs", "credentials", "least privilege"],
        dependencies: [dependency("DATA_PLATFORM", ALL), dependency("SECRETS", ALL)], requiredFor: ALL },
    { nodeId: "CLIENT", layer: "Client", canonicalPlatforms: ["Next.js", "React"],
        responsibility: "Executable web and mobile user experience.",
        validates: ["dependency lock", "startup", "routes", "UI", "accessibility", "browser behavior"],
        dependencies: [dependency("BUILD_OS", ALL), dependency("DATA_PLATFORM", ALL), dependency("CLOUD_IDENTITY", ALL)],
        requiredFor: ALL },
    { nodeId: "DEPLOYMENT", layer: "Deployment", canonicalPlatforms: ["Vercel"],
        responsibility: "Production runtime, previews, and environment binding.",
        validates: ["deployment health", "exact revision", "environment parity"],
        dependencies: [dependency("CLIENT", PRODUCTION), dependency("CLOUD_IDENTITY", PRODUCTION),
            dependency("SECRETS", PRODUCTION)], requiredFor: PRODUCTION },
    { nodeId: "DOMAIN_DNS", layer: "Domain and DNS", canonicalPlatforms: ["Hostinger", "DNS Provider"],
        responsibility: "Domains, DNS, SSL, redirects, and mail routing.",
        validates: ["DNS records", "SSL", "redirect consistency"],
        dependencies: [dependency("DEPLOYMENT", PRODUCTION)], requiredFor: PRODUCTION },
    { nodeId: "EMAIL", layer: "Email", canonicalPlatforms: ["Hostinger Mail", "Transactional Provider"],
        responsibility: "SMTP, verification, and notifications.",
        validates: ["deliverability", "templates", "SPF", "DKIM", "DMARC"],
        dependencies: [dependency("DOMAIN_DNS", PRODUCTION), dependency("SECRETS", PRODUCTION)], requiredFor: PRODUCTION },
    { nodeId: "OBSERVABILITY", layer: "Observability", canonicalPlatforms: ["Logs", "Analytics", "Monitoring"],
        responsibility: "Truthful runtime health and telemetry.",
        validates: ["logs", "traces", "metrics", "alerts", "heartbeats"],
        dependencies: [dependency("BUILD_OS", ALL)], requiredFor: ALL },
    { nodeId: "AI_PROVIDERS", layer: "AI Providers", canonicalPlatforms: ["OpenAI", "Anthropic", "Local Models"],
        responsibility: "Governed intelligence engines.", validates: ["key references", "quotas", "routing", "fallback"],
        dependencies: [dependency("CLOUD_IDENTITY", PRODUCTION), dependency("SECRETS", PRODUCTION)], requiredFor: [] },
    { nodeId: "EXTERNAL_SERVICES", layer: "External Services",
        canonicalPlatforms: ["Stripe", "Persona", "Twilio", "Resend", "Maps"],
        responsibility: "Declared product capabilities supplied by external APIs.",
        validates: ["declaration", "connectivity", "configuration", "API health"],
        dependencies: [dependency("CLOUD_IDENTITY", PRODUCTION), dependency("SECRETS", PRODUCTION)], requiredFor: [] },
    { nodeId: "PRODUCT", layer: "Product", canonicalPlatforms: ["Playbook Operating Systems"],
        responsibility: "Complete end-to-end user journeys.",
        validates: ["functional behavior", "acceptance evidence", "certification"],
        dependencies: [dependency("CLIENT", ALL), dependency("OBSERVABILITY", ALL), dependency("DOMAIN_DNS", PRODUCTION),
            dependency("EMAIL", PRODUCTION)],
        requiredFor: ALL }
];

export class DistributedPlatformGraph {
    constructor(readonly nodes: readonly DistributedPlatformNode[] = CANONICAL_DISTRIBUTED_PLATFORM_NODES) {}

    assertTopology(): void {
        const byId = new Map(this.nodes.map(node => [node.nodeId, node]));
        if (byId.size !== this.nodes.length || DISTRIBUTED_PLATFORM_NODE_IDS.some(nodeId => !byId.has(nodeId))) {
            throw new Error("PBS-6000 distributed platform graph has missing or duplicate canonical nodes.");
        }
        for (const node of this.nodes) for (const edge of node.dependencies) {
            if (!byId.has(edge.nodeId)) throw new Error(`PBS-6000 dependency is missing: ${node.nodeId} -> ${edge.nodeId}.`);
        }
        for (const scope of ["FUNCTIONAL_ACCEPTANCE", "PRODUCTION_RELEASE", "CONTINUOUS"] as const) this.order(scope);
    }

    order(scope: PlatformValidationScope, additionalRequired: readonly DistributedPlatformNodeId[] = []): readonly DistributedPlatformNodeId[] {
        const byId = new Map(this.nodes.map(node => [node.nodeId, node]));
        const required = new Set(this.nodes.filter(node => node.requiredFor.includes(scope)).map(node => node.nodeId));
        additionalRequired.forEach(nodeId => required.add(nodeId));
        const visitDependencies = (nodeId: DistributedPlatformNodeId) => {
            const node = byId.get(nodeId);
            if (!node) throw new Error(`Unknown distributed platform node: ${nodeId}.`);
            node.dependencies.filter(edge => edge.scopes.includes(scope)).forEach(edge => {
                if (!required.has(edge.nodeId)) { required.add(edge.nodeId); visitDependencies(edge.nodeId); }
            });
        };
        [...required].forEach(visitDependencies);
        const visiting = new Set<DistributedPlatformNodeId>();
        const visited = new Set<DistributedPlatformNodeId>();
        const ordered: DistributedPlatformNodeId[] = [];
        const visit = (nodeId: DistributedPlatformNodeId) => {
            if (visiting.has(nodeId)) throw new Error(`PBS-6000 distributed platform dependency cycle detected at ${nodeId}.`);
            if (visited.has(nodeId)) return;
            visiting.add(nodeId);
            byId.get(nodeId)!.dependencies.filter(edge => edge.scopes.includes(scope) && required.has(edge.nodeId))
                .forEach(edge => visit(edge.nodeId));
            visiting.delete(nodeId); visited.add(nodeId); ordered.push(nodeId);
        };
        [...required].forEach(visit);
        return ordered;
    }

    evaluate(scope: PlatformValidationScope, evidence: readonly PlatformValidationEvidence[],
        additionalRequired: readonly DistributedPlatformNodeId[] = []): DistributedPlatformReport {
        this.assertTopology();
        const order = this.order(scope, additionalRequired);
        const byId = new Map(this.nodes.map(node => [node.nodeId, node]));
        const latest = new Map<DistributedPlatformNodeId, PlatformValidationEvidence>();
        evidence.forEach(item => {
            const current = latest.get(item.nodeId);
            if (!current || item.checkedAt > current.checkedAt) latest.set(item.nodeId, item);
        });
        const results = order.map(nodeId => {
            const node = byId.get(nodeId)!;
            const proof = latest.get(nodeId);
            const blockers: string[] = [];
            if (!proof) blockers.push(`${nodeId}: no current validation evidence`);
            else if (proof.health !== "HEALTHY") blockers.push(`${nodeId}: ${proof.health} — ${proof.detail}`);
            node.dependencies.filter(edge => edge.scopes.includes(scope) && order.includes(edge.nodeId)).forEach(edge => {
                const upstream = latest.get(edge.nodeId);
                if (!upstream || upstream.health !== "HEALTHY") blockers.push(`${nodeId}: dependency ${edge.nodeId} is ${upstream?.health ?? "UNKNOWN"}`);
            });
            const health: PlatformHealth = blockers.some(item => item.includes("FAILED")) ? "FAILED"
                : blockers.length ? "BLOCKED" : "HEALTHY";
            return { node, health, evidence: proof, blockers };
        });
        const blockers = results.flatMap(result => result.blockers);
        return { scope, health: blockers.length ? "BLOCKED" : "HEALTHY", generatedAt: new Date().toISOString(),
            order, nodes: results, blockers };
    }
}
