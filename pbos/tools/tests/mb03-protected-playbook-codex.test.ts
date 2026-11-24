import { describe, expect, it } from "vitest";
import { requireProtectedMb03Environment } from "../mb03-protected-playbook-codex";

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
            "PBOS_EVIDENCE_DIRECTORY", "PBOS_CHECKPOINT_KEY_BASE64"
        ]) delete config[key];
        config.PBOS_MISSION_EXECUTION_APPROVED = "false";
        expect(requireProtectedMb03Environment(config, true).PBOS_STATE_NAMESPACE)
            .toBe("mb03-private-staging");
        expect(() => requireProtectedMb03Environment(config)).toThrow("configuration missing");
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
