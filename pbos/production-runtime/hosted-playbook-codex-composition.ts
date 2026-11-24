/**
 * MB-03 hosted Playbook Codex composition.
 *
 * This is the single binding between the previously separate governed
 * Ed25519/Neon mission runner and the isolated, provider-attested Vercel
 * Playbook Codex worker. The existing runner owns admission and leases.
 * This module creates no signing keys, approvals, Genesis state, or workers.
 * Its call to execute is the real remote mutation boundary and remains gated.
 */
import { isDeepStrictEqual } from "node:util";
import {
    assertPlaybookRemoteTarget, createRemotePlaybookMission, PLAYBOOK_REMOTE_REPOSITORY
} from "../master-builder/playbook-remote-mission";
import {
    VercelPlaybookProvider, type VercelPlaybookPolicy
} from "../master-builder/vercel-remote-provider";
import { remoteKeyFingerprint } from "../master-builder/remote-attestation";
import {
    executeHostedRemoteWorkerMission,
    type HostedRemoteWorkerInput, type HostedRemoteWorkerAdapters
} from "./hosted-remote-worker-mission";
import { hostedMissionScopeDigest } from "./hosted-signed-mission-approval";

export interface HostedPlaybookCodexComposition {
    readonly input: HostedRemoteWorkerInput;
    readonly policy: VercelPlaybookPolicy;
    readonly adapters: Omit<HostedRemoteWorkerAdapters, "provider" | "trustedWorkerId">;
}

/**
 * No side effects. Refuse to compose a mismatched mission before its approval
 * nonce, lease, model credential or sandbox can be consumed.
 */
export function prepareHostedPlaybookCodexMission(
    input: HostedPlaybookCodexComposition,
    sandbox?: ConstructorParameters<typeof VercelPlaybookProvider>[1]
): HostedRemoteWorkerAdapters {
    const { request, approval, mission, scope } = input.input;
    const { policy, adapters } = input;
    const target = assertPlaybookRemoteTarget(policy.playbook);
    const expected = createRemotePlaybookMission(
        policy.sourceSha, policy.workerId, adapters.admission.disposableNamespace,
        approval.payload.nonce, policy.playbook
    );

    if (!isDeepStrictEqual(mission, expected) ||
        request.repository !== PLAYBOOK_REMOTE_REPOSITORY ||
        request.commit !== policy.sourceSha ||
        approval.payload.repository !== request.repository ||
        approval.payload.commit !== request.commit ||
        approval.payload.missionId !== policy.playbook.missionId ||
        scope.path !== target.path ||
        scope.contentSha256 !== target.afterSha256 ||
        scope.branch !== request.branch ||
        hostedMissionScopeDigest(scope) !== approval.payload.scopeDigest ||
        request.autonomousContinuation !== false || request.maximumMissions !== 1 ||
        request.approvedMissionIds?.length !== 1 ||
        request.approvedMissionIds[0] !== expected.missionId ||
        request.authorizationArtifactId !== "hosted-approval:" + approval.payload.nonce ||
        adapters.trust.authorityId !== policy.authorityId ||
        adapters.trust.providerId !== policy.providerId ||
        adapters.trust.allowFixture === true ||
        remoteKeyFingerprint(policy.signer) !== remoteKeyFingerprint(adapters.trust.publicKey)) {
        throw new Error("MB-03 hosted Playbook Codex execution is not bound to its exact reviewed authority.");
    }

    const provider = new VercelPlaybookProvider(policy, sandbox);
    if (provider.isolationProfile !== adapters.trust.isolationProfile) {
        throw new Error("MB-03 hosted worker image, model, or isolation profile is not approved.");
    }
    return {
        ...adapters,
        trustedWorkerId: policy.workerId,
        provider
    };
}

/**
 * Dispatches only under the existing Ed25519, Genesis, host-attestation and
 * durable Neon-fence checks. A signed provider return is not certification:
 * the runner pauses for independent verification.
 */
export async function executeHostedPlaybookCodexMission(
    composition: HostedPlaybookCodexComposition,
    sandbox?: ConstructorParameters<typeof VercelPlaybookProvider>[1]
) {
    const adapters = prepareHostedPlaybookCodexMission(composition, sandbox);
    return executeHostedRemoteWorkerMission(composition.input, adapters);
}
