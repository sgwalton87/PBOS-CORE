import { chmodSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { allowsManagedSecretAlias, googleRuntimeIdentity, protectedMb03FileBoundaryCode, readProtectedMb03File, requireProtectedMb03Environment } from "../mb03-protected-playbook-codex";

const SHA = "a".repeat(64);
function fixture(): NodeJS.ProcessEnv {
    return {
        CLOUD_RUN_JOB: "pbos-mb03-playbook-codex",
        PBOS_MISSION_EXECUTION_APPROVED: "true",
        PBOS_DATABASE_URL: "postgresql://pbos_worker:fixture-password@ep-staging.neon.tech/pbos_runner",
        PBOS_EXPECTED_NEON_HOST: "ep-staging.neon.tech",
        PBOS_EXPECTED_NEON_ROLE: "pbos_worker",
        PBOS_DISPOSABLE_STATE_FILE: "/var/lib/pbos-missions/disposable.json",
        PBOS_STATE_NAMESPACE: "mb03-private-staging",
        PBOS_DISPOSABLE_AUTHORITY_ID: "01234567-89ab-4def-8abc-0123456789ab",
        PBOS_OBSERVATION_HOME: "/var/lib/pbos-observation",
        PBOS_OBSERVATION_KEY_FILE: "/var/run/secrets/canonical-seal.key",
        PBOS_EXPECTED_STATE_SET_SHA256: SHA,
        PBOS_PPS_DIRECTORY: "/var/run/pbos-canon",
        PBOS_PPS_MANIFEST_SHA256: SHA,
        PBOS_MISSION_INPUT_FILE: "/var/run/pbos-missions/approved.json",
        PBOS_APPROVAL_PUBLIC_KEY_FILE: "/var/run/pbos-operator/public.pem",
        PBOS_APPROVAL_PUBLIC_KEY_SHA256: SHA,
        PBOS_PROVIDER_SIGNING_KEY_FILE: "/var/run/pbos-provider/private.pem",
        PBOS_PROVIDER_PUBLIC_KEY_FILE: "/var/run/pbos-provider/public.pem",
        PBOS_PROVIDER_PUBLIC_KEY_SHA256: "b".repeat(64),
        PBOS_PROVIDER_AUTHORITY_ID: "approved-authority",
        PBOS_PROVIDER_ID: "vercel-playbook",
        PBOS_PLAYBOOK_SOURCE_SHA: "c".repeat(40),
        PBOS_PLAYBOOK_IMAGE: "vcr.vercel.com/pbos-genesis/the-playbook/pbos-mb03-playbook-worker@sha256:" + SHA,
        PBOS_CODEX_BINARY_SHA256: SHA,
        PBOS_WORKER_ID: "worker-001",
        PBOS_WORKER_MODEL: "reviewed-model",
        PBOS_VERCEL_SANDBOX_TOKEN: "synthetic-fixture-token",
        PBOS_VERCEL_SANDBOX_TEAM_ID: "team_Fixture",
        PBOS_VERCEL_SANDBOX_PROJECT_ID: "prj_Fixture",
        PBOS_MODEL_ORIGIN: "https://model.example.invalid",
        PBOS_MODEL_ADMIN_ORIGIN: "https://model-control.example.invalid",
        PBOS_MODEL_ADMIN_CREDENTIAL: "synthetic-control-secret",
        PBOS_DISPATCH_JOURNAL_BUCKET: "pbos-staging-journal-fixture",
        PBOS_EVIDENCE_DIRECTORY: "/var/lib/pbos-evidence",
        PBOS_CHECKPOINT_KEY_BASE64: Buffer.alloc(32, 1).toString("base64"),
        PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT:
            "pbos-mb03-worker@pbos-genesis-staging.iam.gserviceaccount.com"
    };
}

describe("MB-03 separate protected remote Codex job configuration", () => {
    it("accepts only a complete, narrowly scoped configuration without doing I/O", () => {
        const config = requireProtectedMb03Environment(fixture());
        expect(config.PBOS_STATE_NAMESPACE).toBe("mb03-private-staging");
        expect(config.PBOS_DISPOSABLE_STATE_FILE).not.toContain("pbos-observation");
    });
    it("allows non-mission readiness without inventing execution-only identities", () => {
        const config = fixture();
        for (const key of [
            "PBOS_MISSION_INPUT_FILE", "PBOS_PROVIDER_SIGNING_KEY_FILE",
            "PBOS_PROVIDER_AUTHORITY_ID", "PBOS_PROVIDER_ID", "PBOS_WORKER_ID",
            "PBOS_WORKER_MODEL", "PBOS_MODEL_ORIGIN", "PBOS_MODEL_ADMIN_ORIGIN",
            "PBOS_MODEL_ADMIN_CREDENTIAL", "PBOS_DISPATCH_JOURNAL_BUCKET",
            "PBOS_EVIDENCE_DIRECTORY", "PBOS_CHECKPOINT_KEY_BASE64",
            "PBOS_VERCEL_SANDBOX_TOKEN"
        ]) delete config[key];
        config.CLOUD_RUN_JOB = "pbos-mb03-playbook-readiness";
        config.PBOS_MISSION_EXECUTION_APPROVED = "false";
        expect(requireProtectedMb03Environment(config, true).PBOS_STATE_NAMESPACE)
            .toBe("mb03-private-staging");
        expect(() => requireProtectedMb03Environment(config)).toThrow("configuration missing");
    });
    it("enforces separate identities for signed missions and non-mission readiness", () => {
        expect(() => requireProtectedMb03Environment({
            ...fixture(), CLOUD_RUN_JOB: "pbos-mb03-playbook-readiness"
        })).toThrow("distinct");
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_MISSION_EXECUTION_APPROVED: "false"
        }, true)).toThrow("distinct");
        expect(() => requireProtectedMb03Environment({
            ...fixture(), CLOUD_RUN_JOB: "pbos-mb03-playbook-readiness",
            PBOS_MISSION_EXECUTION_APPROVED: "true"
        }, true)).toThrow("distinct");
    });
    it("attests only the correct job identity for each execution mode", async () => {
        const expected = "pbos-mb03-worker@pbos-genesis-staging.iam.gserviceaccount.com";
        const request = vi.fn().mockResolvedValue({
            ok: true,
            headers: { get: (name: string) => name === "metadata-flavor" ? "Google" : null },
            text: async () => expected
        });
        vi.stubGlobal("fetch", request);
        try {
            const readiness = { CLOUD_RUN_JOB: "pbos-mb03-playbook-readiness" };
            const mission = { CLOUD_RUN_JOB: "pbos-mb03-playbook-codex" };
            expect(await googleRuntimeIdentity(expected, readiness, true)).toBe(true);
            expect(await googleRuntimeIdentity(expected, mission, false)).toBe(true);
            const callsBeforeRejection = request.mock.calls.length;
            expect(await googleRuntimeIdentity(expected, readiness, false)).toBe(false);
            expect(await googleRuntimeIdentity(expected, mission, true)).toBe(false);
            expect(request.mock.calls.length).toBe(callsBeforeRejection);
        } finally {
            vi.unstubAllGlobals();
        }
    });
    it("does not execute in the existing read-only admission observer", () => {
        expect(() => requireProtectedMb03Environment({
            ...fixture(), CLOUD_RUN_JOB: "pbos-genesis-admission"
        })).toThrow("distinct");
    });
    it("rejects absent positive mission activation", () => {
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_MISSION_EXECUTION_APPROVED: "false"
        })).toThrow("explicitly approved");
    });
    it("rejects missing protected runtime resources", () => {
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_PROVIDER_SIGNING_KEY_FILE: ""
        })).toThrow("PROVIDER_SIGNING_KEY_FILE");
    });
    it("blocks a canonical observation snapshot used as the execution file", () => {
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_DISPOSABLE_STATE_FILE: "/var/lib/pbos-observation/genesis-state.json"
        })).toThrow("cannot use the canonical");
    });
    it("rejects any writable state directory containing the protected canonical observation", () => {
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_OBSERVATION_HOME: "/var/lib/pbos-missions/canonical"
        })).toThrow("cannot use the canonical");
    });
    it("rejects non-Neon database, elevated role and incorrect pin", () => {
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_DATABASE_URL: "postgresql://pbos_worker:fixture@db.example.invalid/pbos_runner",
            PBOS_EXPECTED_NEON_HOST: "db.example.invalid"
        })).toThrow("Neon connection");
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_EXPECTED_NEON_ROLE: "pbos_runner_owner",
            PBOS_DATABASE_URL: "postgresql://pbos_runner_owner:fixture@ep-staging.neon.tech/pbos_runner"
        })).toThrow("Neon connection");
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_APPROVAL_PUBLIC_KEY_SHA256: "invalid"
        })).toThrow("digest");
    });
    it("rejects a floating image or a Core canary image", () => {
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_PLAYBOOK_IMAGE: "vcr.vercel.com/pbos-genesis/pbos-mb03-playbook/worker:latest"
        })).toThrow("image identity");
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_PLAYBOOK_IMAGE:
                "vcr.vercel.com/pbos-genesis/pbos-mb03-canary/worker@sha256:" + SHA
        })).toThrow("image identity");
    });
    it("rejects unreviewed service account and state authority", () => {
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT:
                "pbos-genesis-executor@pbos-genesis-staging.iam.gserviceaccount.com"
        })).toThrow("cloud identity");
        expect(() => requireProtectedMb03Environment({
            ...fixture(), PBOS_DISPOSABLE_AUTHORITY_ID: "unbound"
        })).toThrow("state");
    });
});

describe("MB-03 managed protected-file boundary", () => {
    it("allows only the platform-managed /var/run secret alias", () => {
        expect(allowsManagedSecretAlias("/var/run/secrets/mb03/operator/public.pem", "/run/secrets/mb03/operator")).toBe(true);
        expect(allowsManagedSecretAlias("/var/lib/pbos-missions/mission.json", "/tmp/mission")).toBe(false);
        expect(allowsManagedSecretAlias("/var/run/secrets/other/public.pem", "/run/secrets/other")).toBe(false);
        expect(allowsManagedSecretAlias("/var/run/secrets/mb03/operator/public.pem", "/run/secrets/mb03/other")).toBe(false);
        expect(allowsManagedSecretAlias("/var/run/secrets/mb03/operator/public.pem", "/run/secrets/mb03/operator/redirect")).toBe(false);
    });

    function fixturePath(name: string): string {
        const root = realpathSync(mkdtempSync(join(tmpdir(), "mb03-file-boundary-")));
        const path = join(root, name);
        writeFileSync(path, "synthetic-protected-content", { mode: 0o600 });
        chmodSync(path, 0o600);
        return path;
    }

    it("accepts a regular private file and emits stable diagnostic codes", () => {
        const path = fixturePath("valid");
        expect(readProtectedMb03File(path, 1024, "mission-input").toString()).toBe("synthetic-protected-content");
        expect(protectedMb03FileBoundaryCode("provider-public-key", "missing"))
            .toBe("MB03_FILE_BOUNDARY:provider-public-key:missing");
    });
    it("classifies missing, symlink, exposed, oversized and non-regular inputs", () => {
        const missing = join(realpathSync(mkdtempSync(join(tmpdir(), "mb03-file-boundary-"))), "missing");
        expect(() => readProtectedMb03File(missing, 1024, "operator-public-key"))
            .toThrow("MB03_FILE_BOUNDARY:operator-public-key:missing");
        const symlinkRoot = realpathSync(mkdtempSync(join(tmpdir(), "mb03-file-boundary-")));
        const target = join(symlinkRoot, "target");
        writeFileSync(target, "target", { mode: 0o600 }); chmodSync(target, 0o600);
        const link = join(symlinkRoot, "link"); symlinkSync(target, link);
        expect(() => readProtectedMb03File(link, 1024, "provider-signing-key"))
            .toThrow("MB03_FILE_BOUNDARY:provider-signing-key:redirected");
        const exposed = fixturePath("exposed"); chmodSync(exposed, 0o644);
        expect(() => readProtectedMb03File(exposed, 1024, "provider-public-key"))
            .toThrow("MB03_FILE_BOUNDARY:provider-public-key:exposed-permissions");
        const oversized = fixturePath("oversized");
        expect(() => readProtectedMb03File(oversized, 1, "mission-input"))
            .toThrow("MB03_FILE_BOUNDARY:mission-input:oversized");
        const directory = realpathSync(mkdtempSync(join(tmpdir(), "mb03-file-boundary-dir-")));
        expect(() => readProtectedMb03File(directory, 1024, "disposable-state"))
            .toThrow("MB03_FILE_BOUNDARY:disposable-state:not-regular");
    });
});
