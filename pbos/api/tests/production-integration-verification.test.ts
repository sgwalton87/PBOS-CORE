import { describe, expect, it, vi } from "vitest";
import { verifyProductionIntegrationHealth, verifyProductionIntegrationMetadata } from "../../tools/verify-production-integration";

const project = "pbos-production-fixture";
const region = "us-west1";
const digest = "sha256:" + "a".repeat(64);
const name = `projects/${project}/locations/${region}/services/pbos-v1-integration-production`;
const revision = "pbos-v1-integration-production-00001-fixture";
const uri = "https://pbos-production-fixture.run.app";
const image = `${region}-docker.pkg.dev/${project}/pbos-production/integration@${digest}`;

function observation() {
    return {
        name, uri, ingress: "INGRESS_TRAFFIC_INTERNAL_ONLY", invokerIamDisabled: false,
        terminalCondition: { state: "CONDITION_SUCCEEDED" },
        latestReadyRevision: name + "/revisions/" + revision, latestCreatedRevision: revision,
        scaling: { maxInstanceCount: 1 }, trafficStatuses: [{ revision, percent: 100 }],
        template: {
            serviceAccount: `pbos-prod-runtime@${project}.iam.gserviceaccount.com`,
            maxInstanceRequestConcurrency: 1, scaling: { maxInstanceCount: 1 },
            containers: [{ image, env: [
                { name: "PBOS_ORGANIZATION_ID", value: "PLAYBOOK-ORG-001" },
                { name: "PBOS_INTEGRATION_STATE_PATH", value: "/mnt/pbos-state/integration-state.json" },
                { name: "PBOS_CONNECTOR_TRUST_BUNDLE", valueSource: {
                    secretKeyRef: { secret: "pbos-connector-trust-bundle-production", version: "2" },
                } },
            ], volumeMounts: [{ name: "integration-state", mountPath: "/mnt/pbos-state" }] }],
            volumes: [{ name: "integration-state", nfs: { server: "10.0.0.2", path: "/pbos_prod", readOnly: false } }],
        },
    };
}

describe("PBOS production runtime verification", () => {
    it("accepts the private, single-revision, digest-pinned observation", () => {
        expect(verifyProductionIntegrationMetadata(observation(), project, region, digest))
            .toEqual({ uri, revision, image });
    });

    it("rejects public ingress, incorrect digests and split or stale traffic", () => {
        const service = observation();
        expect(() => verifyProductionIntegrationMetadata({ ...service, ingress: "INGRESS_TRAFFIC_ALL" }, project, region, digest)).toThrow();
        expect(() => verifyProductionIntegrationMetadata(service, project, region, "sha256:" + "b".repeat(64))).toThrow();
        service.trafficStatuses = [{ revision, percent: 50 }, { revision: "other", percent: 50 }];
        expect(() => verifyProductionIntegrationMetadata(service, project, region, digest)).toThrow();
    });

    it("rejects a staging project or a moving secret version", () => {
        const service = observation();
        expect(() => verifyProductionIntegrationMetadata(service, "pbos-genesis-staging", region, digest)).toThrow();
        service.template.containers[0].env[2].valueSource!.secretKeyRef.version = "latest";
        expect(() => verifyProductionIntegrationMetadata(service, project, region, digest)).toThrow();
    });

    it("requires real PBOS health and an application-layer denial for an unsigned read", async () => {
        const transport = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(Response.json({ status: "healthy", service: "pbos-v1-integration" }))
            .mockResolvedValueOnce(Response.json({ error: "Missing connector authentication header: x-pbos-organization-id" }, { status: 401 }));
        await expect(verifyProductionIntegrationHealth(uri, "fixture-token", transport)).resolves.toEqual({
            health: "PASS", unsignedConnectorRequest: "DENIED",
        });
        expect(transport).toHaveBeenCalledTimes(2);
        expect(JSON.parse(String(transport.mock.calls[1][1]?.body)).operation).toBe("GET_CONNECTOR_STATUS");
    });

    it("rejects IAM-edge errors or an unsigned success as application-layer denial evidence", async () => {
        for (const status of [200, 401, 403]) {
            const transport = vi.fn<typeof fetch>()
                .mockResolvedValueOnce(Response.json({ status: "healthy", service: "pbos-v1-integration" }))
                .mockResolvedValueOnce(Response.json({ error: "Google IAM denied invocation." }, { status }));
            await expect(verifyProductionIntegrationHealth(uri, "fixture-token", transport)).rejects.toThrow(/HMAC boundary/);
        }
    });
});
