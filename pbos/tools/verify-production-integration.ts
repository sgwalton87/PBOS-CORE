import { readFileSync } from "node:fs";

type ServiceObservation = {
    name?: string;
    uri?: string;
    ingress?: string;
    invokerIamDisabled?: boolean;
    reconciling?: boolean;
    terminalCondition?: { state?: string };
    latestReadyRevision?: string;
    latestCreatedRevision?: string;
    scaling?: { maxInstanceCount?: number };
    trafficStatuses?: { revision?: string; percent?: number; tag?: string }[];
    template?: {
        serviceAccount?: string;
        maxInstanceRequestConcurrency?: number;
        scaling?: { maxInstanceCount?: number };
        containers?: { image?: string; env?: { name?: string; value?: string;
            valueSource?: { secretKeyRef?: { secret?: string; version?: string } } }[];
            volumeMounts?: { name?: string; mountPath?: string }[] }[];
        volumes?: { name?: string; nfs?: { server?: string; path?: string; readOnly?: boolean } }[];
    };
};

export function verifyProductionIntegrationMetadata(
    service: ServiceObservation, projectId: string, region: string, digest: string
) {
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) ||
        projectId.includes("stag") || projectId === "playbook-platform-500403" ||
        !/^[a-z]+-[a-z]+[0-9]+$/.test(region) || !/^sha256:[0-9a-f]{64}$/.test(digest)) {
        throw new Error("Provide the approved production project, region, and immutable image digest.");
    }
    const name = `projects/${projectId}/locations/${region}/services/pbos-v1-integration-production`;
    const image = `${region}-docker.pkg.dev/${projectId}/pbos-production/integration@${digest}`;
    const shortRevision = (value?: string) => value?.startsWith(name + "/revisions/")
        ? value.slice(name.length + "/revisions/".length) : value;
    const revision = shortRevision(service.latestReadyRevision);
    const traffic = service.trafficStatuses ?? [];
    if (service.name !== name || service.ingress !== "INGRESS_TRAFFIC_INTERNAL_ONLY" || service.invokerIamDisabled ||
        service.reconciling === true || service.terminalCondition?.state !== "CONDITION_SUCCEEDED" ||
        !revision || revision !== shortRevision(service.latestCreatedRevision) || traffic.length !== 1 ||
        shortRevision(traffic[0].revision) !== revision || traffic[0].percent !== 100 || traffic[0].tag) {
        throw new Error("The approved private service and sole ready revision could not be verified.");
    }
    const template = service.template;
    if (template?.serviceAccount !== `pbos-prod-runtime@${projectId}.iam.gserviceaccount.com` ||
        service.scaling?.maxInstanceCount !== 1 || template.scaling?.maxInstanceCount !== 1 ||
        template.maxInstanceRequestConcurrency !== 1 || template.containers?.length !== 1 ||
        template.containers[0].image !== image) {
        throw new Error("Runtime image, production identity, or single-writer limits differ from the deployment contract.");
    }
    const container = template.containers[0];
    const volume = template.volumes?.find(item => item.name === "integration-state")?.nfs;
    const trust = container.env?.find(item => item.name === "PBOS_CONNECTOR_TRUST_BUNDLE");
    const secret = trust?.valueSource?.secretKeyRef;
    const secretName = "pbos-connector-trust-bundle-production";
    if (trust?.value !== undefined || !secret ||
        (secret.secret !== secretName && secret.secret !== `projects/${projectId}/secrets/${secretName}`) ||
        !/^[1-9][0-9]*$/.test(secret.version ?? "") ||
        !volume?.server || !volume.path || volume.readOnly ||
        !container.volumeMounts?.some(item => item.name === "integration-state" && item.mountPath === "/mnt/pbos-state") ||
        !container.env?.some(item => item.name === "PBOS_INTEGRATION_STATE_PATH" && item.value === "/mnt/pbos-state/integration-state.json") ||
        !container.env?.some(item => item.name === "PBOS_ORGANIZATION_ID" && item.value === "PLAYBOOK-ORG-001")) {
        throw new Error("Production trust reference, canonical organization, or durable state mount could not be verified.");
    }
    const uri = new URL(service.uri ?? "");
    if (uri.protocol !== "https:" || !uri.hostname.endsWith(".run.app") || uri.username || uri.password ||
        uri.port || uri.pathname !== "/" || uri.search || uri.hash) {
        throw new Error("Cloud Run service URI failed validation.");
    }
    return { uri: uri.origin, revision, image };
}

export async function verifyProductionIntegrationHealth(uri: string, invokeToken: string, transport = fetch) {
    if (!invokeToken || /\s/.test(invokeToken)) throw new Error("An authorized short-lived Cloud Run invoker token is required.");
    const headers = { Authorization: `Bearer ${invokeToken}` };
    const health = await transport(new URL("/health", uri), { headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
    const payload = health.ok ? await health.json() as { status?: unknown; service?: unknown } | null : null;
    if (health.status !== 200 || payload?.status !== "healthy" || payload?.service !== "pbos-v1-integration") {
        throw new Error("The PBOS health response did not identify the expected runtime.");
    }
    const unsigned = await transport(new URL("/pbos/v1", uri), {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        redirect: "error", signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ apiVersion: "v1", operation: "GET_CONNECTOR_STATUS",
            correlationId: "production-readonly-verification", payload: { connectorId: "PLAYBOOK-CONNECTOR-001" } }),
    });
    const denial = unsigned.status === 401 ? await unsigned.json() as { error?: unknown } | null : null;
    if (unsigned.status !== 401 || typeof denial?.error !== "string" || !/^Missing connector authentication header: x-pbos-/.test(denial.error)) {
        throw new Error("The PBOS HMAC boundary did not produce the expected application-layer denial.");
    }
    return { health: "PASS", unsignedConnectorRequest: "DENIED" } as const;
}

if (require.main === module) {
    void (async () => {
        const [file, project, region, digest] = process.argv.slice(2);
        const metadata = verifyProductionIntegrationMetadata(JSON.parse(readFileSync(file, "utf8")), project, region, digest);
        const checks = await verifyProductionIntegrationHealth(metadata.uri, process.env.PBOS_CLOUD_RUN_ID_TOKEN ?? "");
        process.stdout.write(JSON.stringify({ ...metadata, ...checks }) + "\n");
    })().catch(error => {
        // Fetch and parsing failures may contain URLs or payload fragments. Report only a sanitized verdict.
        process.stderr.write((error instanceof Error && error.message.startsWith("The PBOS")
            ? error.message : "Production PBOS verification failed.") + "\n");
        process.exitCode = 1;
    });
}
