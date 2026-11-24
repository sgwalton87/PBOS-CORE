import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const job = readFileSync(resolve("job.mb03-readiness.yaml"), "utf8");
const workflow = readFileSync(resolve(".github/workflows/mb03-playbook-controller-image.yml"), "utf8");
const smoke = readFileSync(resolve("containers/mb03-controller/staging-smoke.sh"), "utf8");
const signer = readFileSync(resolve("pbos/tools/mb03-sign-mission.ts"), "utf8");
const template = readFileSync(resolve("infra/mb03/job.secret-staging-preflight.template.yaml"), "utf8");

function configuredPath(name: string): string | null {
    const marker = "            - name: " + name + "\n              value: ";
    const at = job.indexOf(marker);
    return at < 0 ? null : job.slice(at + marker.length).split("\n", 1)[0];
}

describe("MB-03 readiness is a non-executing, secret-staged Cloud Run job", () => {
    it("cannot inadvertently run a mission or use an old image digest", () => {
        expect(job).toContain("name: pbos-mb03-playbook-codex");
        expect(job).toContain("image: REPLACE_WITH_APPROVED_CONTROLLER_IMAGE_DIGEST");
        expect(job).toContain('name: PBOS_MISSION_EXECUTION_APPROVED\n              value: "false"');
        expect(job).not.toContain('name: PBOS_MISSION_EXECUTION_APPROVED\n              value: "true"');
        expect(job).toContain("            command:\n            - /usr/local/bin/mb03-stage-secrets");
        expect(job).toContain("            - --verify-bindings");
        expect(job).not.toContain("            command:\n            - ./node_modules/.bin/tsx");
        expect(job).toContain("          maxRetries: 0");
    });

    it("uses node-private staging paths, not root-owned Secret Manager volume paths", () => {
        const expected = {
            PBOS_APPROVAL_PUBLIC_KEY_FILE: "/var/lib/pbos-private/operator-public.pem",
            PBOS_PROVIDER_PUBLIC_KEY_FILE: "/var/lib/pbos-private/provider-public.pem",
            PBOS_PROVIDER_SIGNING_KEY_FILE: "/var/lib/pbos-private/provider-private.pem",
            PBOS_OBSERVATION_KEY_FILE: "/var/lib/pbos-private/observation-key"
        };
        for (const [key, value] of Object.entries(expected)) {
            expect(configuredPath(key), key).toBe(value);
        }
        expect(job).toContain("              mountPath: /var/run/secrets/mb03/operator");
        expect(job).toContain("              mountPath: /var/run/secrets/mb03/provider-public");
        expect(job).toContain("              mountPath: /var/run/secrets/mb03/provider");
        expect(job).toContain("              mountPath: /var/run/secrets/mb03/observation");
    });

    it("does not inject execution-only credentials into the readiness process", () => {
        for (const key of [
            "PBOS_PROVIDER_SIGNING_KEY_PEM",
            "PBOS_CHECKPOINT_KEY_BASE64",
            "PBOS_MODEL_ADMIN_CREDENTIAL",
            "PBOS_VERCEL_SANDBOX_TOKEN"
        ]) {
            expect(job).not.toContain("name: " + key);
        }
        expect(job).toMatch(/- name: execution-state\n            csi:\n              driver: gcsfuse.run.googleapis.com\n              readOnly: true/);
    });

    it("pins the reviewed Playbook source used by the signed mission builder", () => {
        const source = signer.match(/const SOURCE = "([a-f0-9]{40})"/)?.[1];
        expect(source).toBeTruthy();
        expect(job).toContain("name: PBOS_PLAYBOOK_SOURCE_SHA" + String.fromCharCode(10) + "              value: " + source);
        expect(template).toContain("name: PBOS_PLAYBOOK_SOURCE_SHA" + String.fromCharCode(10) + "              value: " + source);
    });

    it("runs functional offline root-to-node smoke, not just string checks", () => {
        expect(workflow).toContain("Execute zero-credential fail-closed smoke with no network");
        expect(workflow).toContain("Exercise root-owned synthetic secret staging");
        expect(workflow).toContain("--entrypoint /bin/sh pbos-mb03-controller:offline /checks/staging-smoke.sh");
        expect(smoke).toContain("/usr/local/bin/mb03-stage-secrets /bin/sh -c");
        expect(smoke).toContain('test "$(id -u)" -eq 1000');
        expect(smoke).toContain("FAIL: symlink leaf accepted");
        expect(smoke).toContain("FAIL: nested directory redirect accepted");
        expect(smoke).toContain("FAIL: existing staging directory accepted");
    });
});
