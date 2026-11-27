import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
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
        expect(job).toContain("name: pbos-mb03-playbook-readiness");
        expect(job).not.toContain("name: pbos-mb03-playbook-codex");
        expect(template).toContain("name: pbos-mb03-playbook-readiness");
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
            PBOS_OBSERVATION_KEY_FILE: "/var/lib/pbos-private/observation-key"
        };
        for (const [key, value] of Object.entries(expected)) {
            expect(configuredPath(key), key).toBe(value);
        }
        expect(job).toContain("              mountPath: /var/run/secrets/mb03/operator");
        expect(job).toContain("              mountPath: /var/run/secrets/mb03/provider-public");
        expect(job).not.toContain("              mountPath: /var/run/secrets/mb03/provider\n");
        expect(job).not.toContain("name: PBOS_PROVIDER_SIGNING_KEY_FILE");
        expect(job).not.toContain("secretName: mb03-provider-signing-key");
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

    it("persists the validated published image digest for the next GitHub Actions step", () => {
        expect(workflow).toContain('echo "PINNED=$PINNED" >> "$GITHUB_ENV"');
        expect(workflow).toContain('grep -Fq "image: $PINNED" "$manifest"');
        expect(workflow).toContain("readiness=pbos-mb03-playbook-readiness");
    });

    it("limits the image publisher to registry and artifact operations", () => {
        const publisher = workflow.split("\n  publish-staging-image:\n")[1];
        expect(publisher).toBeDefined();
        expect(publisher).toContain("docker push");
        expect(publisher).toContain("actions/upload-artifact@");
        expect(publisher).not.toMatch(/gcloud\s+(run|logging)\s|verify-existing-readiness\.py/);
        expect(publisher.indexOf('grep -Fq "image: $PINNED"')).toBeLessThan(publisher.indexOf("actions/upload-artifact@"));
    });

    it("exercises every publisher shell step with registry-only fakes and no cloud credentials", () => {
        const dir = mkdtempSync(resolve(tmpdir(), "mb03-publisher-"));
        try {
            const stub = (name: string, script: string) =>
                writeFileSync(resolve(dir, name), "#!/bin/sh\nset -eu\n" + script, { mode: 0o700 });
            stub("docker", 'case "$1" in build|push) ;; *) exit 91;; esac');
            stub("gcloud", [
                'case "$1 $2 $3" in',
                '  "artifacts repositories describe" | "auth configure-docker us-west1-docker.pkg.dev") ;;',
                '  "artifacts docker images") test "$4" = describe; printf "sha256:%064d\\n" 1 ;;',
                '  *) echo "Unexpected cloud call: $1 $2" >&2; exit 92 ;;',
                "esac"
            ].join("\n"));
            const env = {
                PATH: dir + ":/usr/bin:/bin", HOME: dir, RUNNER_TEMP: dir, GITHUB_REF: "refs/heads/main",
                GITHUB_SHA: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
                GITHUB_ENV: resolve(dir, "env"), GITHUB_STEP_SUMMARY: resolve(dir, "summary"), PINNED: ""
            };
            writeFileSync(env.GITHUB_ENV, "");
            const publisher = workflow.split("\n  publish-staging-image:\n")[1];
            const blocks = [...publisher.matchAll(/^        run: \|\n((?:          [^\n]*\n|\n)+)/gm)];
            expect(blocks.length).toBeGreaterThan(0);
            for (const [, script] of blocks) {
                execFileSync("bash", ["-euo", "pipefail", "-c", script.replace(/^          /gm, "")], { env });
                env.PINNED = readFileSync(env.GITHUB_ENV, "utf8").match(/^PINNED=(.+)$/m)?.[1] ?? "";
            }
            expect(env.PINNED).toMatch(/@sha256:[0-9a-f]{64}$/);
            expect(readFileSync(resolve(dir, "mb03-readiness-pinned.yaml"), "utf8")).toContain("image: " + env.PINNED);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });

    it("rejects a manual image request for the wrong SHA, branch, attempt or a simultaneous live check", () => {
        const script = workflow.split("      - name: Validate manual image publication scope")[1]
            .split("        run: |\n")[1].split("      - uses:")[0].replace(/^          /gm, "");
        const sha = "a".repeat(40);
        const env = { REQUESTED_SHA: sha, GITHUB_SHA: sha, GITHUB_REF: "refs/heads/main", GITHUB_RUN_ATTEMPT: "1", READINESS_MANIFEST: "" };
        expect(spawnSync("bash", ["-c", script], { env }).status).toBe(0);
        for (const change of [{ REQUESTED_SHA: "main" }, { READINESS_MANIFEST: "another-action" },
            { GITHUB_REF: "refs/heads/other" }, { GITHUB_RUN_ATTEMPT: "2" }]) {
            expect(spawnSync("bash", ["-c", script], { env: { ...env, ...change } }).status).not.toBe(0);
        }
    });

    it("does not auto-publish or rerun readiness on audit-only changes", () => {
        const pushOnly = workflow.split("  pull_request:")[0];
        expect(pushOnly).not.toContain("containers/mb03-controller/**");
        expect(pushOnly).not.toContain("mb03-playbook-controller-image.yml");
        for (const path of [
            "containers/mb03-controller/stage-secrets.sh",
            "containers/mb03-controller/staging-smoke.sh",
            "containers/mb03-controller/pin-readiness.sh",
            "Dockerfile.mb03-playbook-controller"
        ]) {
            expect(pushOnly).toContain(path);
        }
        expect(pushOnly).not.toContain("audit-execution-image-provenance");
        expect(pushOnly).not.toContain("audit-signed-controller-parity");
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
