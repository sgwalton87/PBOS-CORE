import { generateKeyPairSync, randomUUID } from "node:crypto";
import type { Sandbox } from "@vercel/sandbox";
import { describe, expect, it, vi } from "vitest";
import {
    assertPlaybookRemoteTarget, createRemotePlaybookMission, playbookRemotePath
} from "../playbook-remote-mission";
import type { PlaybookMb03MissionId, PlaybookRemoteTarget } from "../playbook-remote-mission";
import { VercelPlaybookProvider } from "../vercel-remote-provider";
import { verifyProvision, verifyRemoteReturn, verifyRemoteDisposal } from "../trusted-remote-worker";
import type { RemoteWorkerBinding } from "../trusted-remote-worker";

const sourceSha = "a".repeat(40);
const before = "# MB-03 placeholder — not completed\n";
const after = "# MB-03 output verified by Codex\n";

function setup(missionId: PlaybookMb03MissionId = "MB03-MISSION-001") {
    const target: PlaybookRemoteTarget = { missionId, before, after };
    const mission = createRemotePlaybookMission(sourceSha, "playbook-worker", "staging-fixture", "attempt-fixture", target);
    const binding: RemoteWorkerBinding = {
        authorityId: randomUUID(), fence: randomUUID(), approvalDigest: "b".repeat(64),
        deadline: new Date(Date.now() + 60_000).toISOString(), mission
    };
    const keys = generateKeyPairSync("ed25519");
    const identity = { teamId: "team_Fixture", projectId: "prj_Fixture", token: "synthetic-credential" };
    const policy = {
        ...identity, providerId: "playbook-provider-fixture", authorityId: binding.authorityId,
        sourceSha, workerId: mission.workerId, playbook: target,
        image: "vcr.vercel.com/pbos-genesis/pbos-mb03-playbook/worker@sha256:" + "a".repeat(64),
        codexBinaryDigest: "a".repeat(64), model: "reviewed-model",
        credentials: async () => identity, signer: keys.privateKey,
        dispatch: { reserve: vi.fn(async () => undefined) },
        modelLeases: {
            modelOrigin: "https://broker.example.invalid",
            issue: vi.fn(async () => ({
                id: binding.fence, token: "fixture-lease", expiresAt: new Date(Date.now() + 30_000).toISOString()
            })),
            revoke: vi.fn(async () => undefined)
        }
    };
    const vm = {
        status: "running", image: policy.image, persistent: false,
        expiresAt: new Date(Date.now() + 45_000),
        currentSession: () => ({ sessionId: "playbook-sandbox-fixture" }),
        stop: vi.fn(async () => ({ id: "playbook-sandbox-fixture", status: "stopped" })),
        updateNetworkPolicy: vi.fn(async () => undefined),
        runCommand: vi.fn(async (command: { cmd: string }) => ({
            exitCode: command.cmd === "curl" ? 6 : 0,
            stdout: async () => Buffer.from(after).toString("base64")
        }))
    };
    const api = { create: vi.fn(async (_params: object) => vm), get: vi.fn(async (_params?: object) => vm) };
    const provider = new VercelPlaybookProvider(policy, api as unknown as Pick<typeof Sandbox, "create" | "get">);
    const trust = { providerId: policy.providerId, publicKey: keys.publicKey, isolationProfile: provider.isolationProfile };
    const signal = new AbortController().signal;
    return { target, binding, keys, policy, vm, api, provider, trust, signal };
}

describe("MB-03 Playbook Vercel Codex provider (synthetic transport only)", () => {
    it.each(["MB03-MISSION-001", "MB03-MISSION-002"] as const)(
        "runs one exact-source, one-file %s worker and emits signed return/disposal",
        async missionId => {
            const f = setup(missionId);
            const signedProvision = await f.provider.provision(f.binding, f.signal);
            const provision = verifyProvision(f.binding, signedProvision, f.trust, Date.now());
            expect(f.api.create).toHaveBeenCalledWith(expect.objectContaining({
                image: f.policy.image, networkPolicy: "deny-all", ports: [], persistent: false,
                resources: { vcpus: 1 }
            }));
            expect(f.api.create.mock.calls[0][0]).not.toHaveProperty("source");
            const bootstrap = f.vm.runCommand.mock.calls[0][0] as {
                cmd: string; args: string[];
            };
            expect(bootstrap).toMatchObject({ cmd: "python3" });
            expect(bootstrap.args).toContain("https://github.com/sgwalton87/playbook-platform");
            expect(bootstrap.args).toContain(playbookRemotePath(missionId));
            expect(bootstrap.args).toContain(before);
            expect(bootstrap.args).toContain(sourceSha);
            const output = await f.provider.execute(f.binding, { title: "review", rationale: "one file" }, f.signal);
            const returned = verifyRemoteReturn(f.binding, provision, output.receipt, f.trust.publicKey, Date.now());
            expect(output.files).toEqual([{
                path: playbookRemotePath(missionId), contentBase64: Buffer.from(after).toString("base64")
            }]);
            const invocation = f.vm.runCommand.mock.calls.find(([command]) => command.cmd === "runuser")?.[0];
            expect(invocation).toBeDefined();
            expect(JSON.stringify(invocation)).not.toContain("fixture-lease");
            expect(JSON.stringify(invocation)).not.toContain("synthetic-credential");
            const stopped = await f.provider.dispose(f.binding);
            expect(stopped).toBeDefined();
            expect(verifyRemoteDisposal(f.binding, provision, stopped!, f.trust.publicKey,
                Date.parse(returned.completedAt), Date.now()).status).toBe("STOPPED_AND_REVOKED");
            expect(f.policy.modelLeases.revoke).toHaveBeenCalledOnce();
            expect(f.vm.stop).toHaveBeenCalledOnce();
            await expect(f.provider.provision(f.binding, f.signal)).rejects.toThrow("repeated");
        }
    );

    it("rejects a missing tracked-source target or a forbidden third mission before any sandbox", async () => {
        expect(() => playbookRemotePath("MB03-MISSION-003")).toThrow("Only two");
        expect(() => assertPlaybookRemoteTarget({ missionId: "MB03-MISSION-001", before, after: before }))
            .toThrow("distinct");
        const f = setup();
        await expect(f.provider.provision({
            ...f.binding, mission: { ...f.binding.mission, missionId: "MB03-MISSION-003" }
        }, f.signal)).rejects.toThrow("binding");
        expect(f.api.create).not.toHaveBeenCalled();
    });

    it("rejects wrong repository, file path, source revision and worker identity before spending a model lease", async () => {
        for (const mutate of [
            (binding: RemoteWorkerBinding) => ({ ...binding, mission: { ...binding.mission, repository: "wrong/repo" } }),
            (binding: RemoteWorkerBinding) => ({ ...binding, mission: { ...binding.mission, allowedPaths: ["outside.txt"] } }),
            (binding: RemoteWorkerBinding) => ({ ...binding, mission: { ...binding.mission, sourceSha: "c".repeat(40) } }),
            (binding: RemoteWorkerBinding) => ({ ...binding, mission: { ...binding.mission, workerId: "wrong" } })
        ]) {
            const f = setup();
            await expect(f.provider.provision(mutate(f.binding), f.signal)).rejects.toThrow("binding");
            expect(f.api.create).not.toHaveBeenCalled();
            expect(f.policy.modelLeases.issue).not.toHaveBeenCalled();
        }
    });

    it("rejects reused Core canary image namespace for Playbook missions", () => {
        const f = setup();
        expect(() => new VercelPlaybookProvider({
            ...f.policy, image: "vcr.vercel.com/pbos-genesis/pbos-mb03-canary/worker@sha256:" + "a".repeat(64)
        })).toThrow("own immutable sandbox image namespace");
    });

    it("binds separate signed mission IDs and expected outputs to distinct isolation profiles", () => {
        const first = setup("MB03-MISSION-001");
        const second = setup("MB03-MISSION-002");
        expect(first.provider.isolationProfile).not.toBe(second.provider.isolationProfile);
        const altered = new VercelPlaybookProvider({
            ...first.policy, playbook: { ...first.target, after: "# altered\n" }
        });
        expect(altered.isolationProfile).not.toBe(first.provider.isolationProfile);
    });

    it("performs a non-dispatch sandbox probe without model credentials or a reservation", async () => {
        const f = setup();
        await expect(f.provider.probe(f.signal)).resolves.toMatchObject({
            status: "READY_WITHOUT_MODEL", sourceSha
        });
        expect(f.policy.dispatch.reserve).not.toHaveBeenCalled();
        expect(f.policy.modelLeases.issue).not.toHaveBeenCalled();
        expect(f.vm.stop).toHaveBeenCalledOnce();
        expect(f.vm.runCommand.mock.calls.map(([command]) => command.cmd)).toEqual(["python3", "curl"]);
    });
});
