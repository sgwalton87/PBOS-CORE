/**
 * Build the complete private mission input consumed by the protected Cloud Run
 * Playbook worker.  A signed approval envelope is intentionally not the worker
 * input by itself: the worker also needs the exact request, disposable mission,
 * signed file scope, and before/after target contents.  This module joins those
 * values without signing, uploading, or changing any authority.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ProductionMissionRequest } from "../production-runtime/production-mission-runner";
import type { HostedMissionScope, SignedHostedMissionApproval } from "../production-runtime/hosted-signed-mission-approval";
import { hostedMissionScopeDigest, verifyHostedMissionApproval } from "../production-runtime/hosted-signed-mission-approval";
import { createRemotePlaybookMission, assertPlaybookRemoteTarget, isApprovedPlaybookMissionBranch, type PlaybookRemoteTarget } from "../master-builder/playbook-remote-mission";
import type { Mb03Mission } from "../master-builder/mb03-disposable-mission";
import { MB03_MISSION_SCOPES, MB03_PLAYBOOK_REPOSITORY, MB03_PLAYBOOK_SOURCE_SHA } from "./mb03-sign-mission";

export interface ProtectedPlaybookMissionFile {
    readonly request: ProductionMissionRequest;
    readonly approval: SignedHostedMissionApproval;
    readonly mission: Mb03Mission;
    readonly scope: HostedMissionScope;
    readonly target: PlaybookRemoteTarget;
}

export const MB03_PROTECTED_PACKAGE_BINDINGS = Object.freeze({
    systemId: "PLAYBOOK-SYSTEM-001",
    stateNamespace: "mb03-stage4-synthetic-20261124",
    workerId: "vercel-pbos-canary-01",
    channelId: "mb03-staging-build-channel",
    operatingSystemId: "PBOS",
    connectorId: "sandbox-provider",
    domainRegistrationId: "playbook-staging"
});

function digest(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
}

function boundedRegularFile(path: string, maximumBytes: number): string {
    const full = resolve(path);
    const meta = lstatSync(full);
    if (!meta.isFile() || meta.isSymbolicLink() || meta.size < 1 || meta.size > maximumBytes ||
        realpathSync(full) !== full) {
        throw new Error("Mission package input must be a regular, canonical file.");
    }
    return readFileSync(full, "utf8");
}

function sourceHead(sourceCheckout: string): string {
    const full = realpathSync(resolve(sourceCheckout));
    const head = execFileSync("git", ["-C", full, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (!/^[a-f0-9]{40}$/.test(head)) throw new Error("Pinned Playbook checkout did not report an exact commit.");
    return head;
}

export function validateProtectedPlaybookMissionFile(
    packageFile: ProtectedPlaybookMissionFile,
    trustedOperatorPublicKeyPem?: string,
    now = new Date()
): void {
    const { request, approval, mission, scope, target } = packageFile;
    const targetDigest = assertPlaybookRemoteTarget(target);
    if (request.repository !== MB03_PLAYBOOK_REPOSITORY ||
        request.commit !== approval.payload.commit ||
        request.branch !== scope.branch ||
        !isApprovedPlaybookMissionBranch(scope.branch) ||
        request.actorId !== approval.payload.operatorId ||
        request.authorizationArtifactId !== `hosted-approval:${approval.payload.nonce}` ||
        request.approvedMissionIds?.length !== 1 ||
        request.approvedMissionIds[0] !== approval.payload.missionId ||
        request.maximumMissions !== 1 || request.autonomousContinuation !== false ||
        request.triggerSource === "CONTINUATION" ||
        request.buildChannel.channelId !== MB03_PROTECTED_PACKAGE_BINDINGS.channelId ||
        request.buildChannel.systemId !== MB03_PROTECTED_PACKAGE_BINDINGS.systemId ||
        request.buildChannel.operatingSystemId !== MB03_PROTECTED_PACKAGE_BINDINGS.operatingSystemId ||
        request.buildChannel.connectorId !== MB03_PROTECTED_PACKAGE_BINDINGS.connectorId ||
        request.buildChannel.repository !== MB03_PLAYBOOK_REPOSITORY ||
        request.buildChannel.domainRegistrationIds.length !== 1 ||
        request.buildChannel.domainRegistrationIds[0] !== MB03_PROTECTED_PACKAGE_BINDINGS.domainRegistrationId ||
        mission.missionId !== approval.payload.missionId ||
        mission.repository !== MB03_PLAYBOOK_REPOSITORY || mission.sourceSha !== request.commit ||
        mission.attemptId !== approval.payload.nonce || mission.workerId !== MB03_PROTECTED_PACKAGE_BINDINGS.workerId ||
        mission.stateNamespace !== MB03_PROTECTED_PACKAGE_BINDINGS.stateNamespace ||
        mission.allowedPaths.length !== 1 || mission.allowedPaths[0] !== scope.path ||
        targetDigest.path !== scope.path ||
        digest(target.after) !== scope.contentSha256 ||
        scope.contentSha256 !== targetDigest.afterSha256 ||
        hostedMissionScopeDigest(scope) !== approval.payload.scopeDigest) {
        throw new Error("Protected mission package does not match its signed scope.");
    }
    if (trustedOperatorPublicKeyPem && !verifyHostedMissionApproval(approval, {
        missionId: approval.payload.missionId, repository: MB03_PLAYBOOK_REPOSITORY,
        commit: request.commit, operatorId: approval.payload.operatorId, scope
    }, trustedOperatorPublicKeyPem, now)) {
        throw new Error("Protected mission package signature or lineage is invalid.");
    }
}

export function buildProtectedPlaybookMissionFile(
    approval: SignedHostedMissionApproval,
    sourceCheckout: string,
    proposedContentPath: string,
    trustedOperatorPublicKeyPem?: string,
    now = new Date()
): ProtectedPlaybookMissionFile {
    if (approval.payload.repository !== MB03_PLAYBOOK_REPOSITORY ||
        approval.payload.commit !== MB03_PLAYBOOK_SOURCE_SHA ||
        !(approval.payload.missionId in MB03_MISSION_SCOPES)) {
        throw new Error("Approval is not for the reviewed MB-03 Playbook source.");
    }
    if (sourceHead(sourceCheckout) !== approval.payload.commit) {
        throw new Error("Pinned Playbook checkout does not match the signed source SHA.");
    }
    const missionId = approval.payload.missionId as keyof typeof MB03_MISSION_SCOPES;
    const scope = MB03_MISSION_SCOPES[missionId];
    if (approval.payload.scopeDigest !== hostedMissionScopeDigest(scope)) {
        throw new Error("Signed scope does not match the reviewed mission scope.");
    }
    if (trustedOperatorPublicKeyPem && !verifyHostedMissionApproval(approval, {
        missionId, repository: MB03_PLAYBOOK_REPOSITORY, commit: MB03_PLAYBOOK_SOURCE_SHA,
        operatorId: approval.payload.operatorId, scope
    }, trustedOperatorPublicKeyPem, now)) {
        throw new Error("Signed approval is invalid, expired, or outside the reviewed scope.");
    }
    const before = boundedRegularFile(join(realpathSync(resolve(sourceCheckout)), scope.path), 256 * 1024);
    const after = boundedRegularFile(proposedContentPath, 256 * 1024);
    if (digest(after) !== scope.contentSha256) {
        throw new Error("Proposed content digest does not match the signed mission scope.");
    }
    const target = Object.freeze({ missionId, before, after });
    assertPlaybookRemoteTarget(target);
    const mission = createRemotePlaybookMission(
        MB03_PLAYBOOK_SOURCE_SHA, MB03_PROTECTED_PACKAGE_BINDINGS.workerId,
        MB03_PROTECTED_PACKAGE_BINDINGS.stateNamespace, approval.payload.nonce, target
    );
    const request: ProductionMissionRequest = {
        systemId: MB03_PROTECTED_PACKAGE_BINDINGS.systemId,
        actorId: approval.payload.operatorId,
        authorizationArtifactId: `hosted-approval:${approval.payload.nonce}`,
        repository: MB03_PLAYBOOK_REPOSITORY,
        branch: scope.branch,
        commit: MB03_PLAYBOOK_SOURCE_SHA,
        approvedMissionIds: [missionId],
        autonomousContinuation: false,
        maximumMissions: 1,
        triggerSource: "CLI",
        buildChannel: {
            channelId: MB03_PROTECTED_PACKAGE_BINDINGS.channelId,
            systemId: MB03_PROTECTED_PACKAGE_BINDINGS.systemId,
            operatingSystemId: MB03_PROTECTED_PACKAGE_BINDINGS.operatingSystemId,
            connectorId: MB03_PROTECTED_PACKAGE_BINDINGS.connectorId,
            repository: MB03_PLAYBOOK_REPOSITORY,
            domainRegistrationIds: [MB03_PROTECTED_PACKAGE_BINDINGS.domainRegistrationId]
        }
    };
    const result: ProtectedPlaybookMissionFile = { request, approval, mission, scope, target };
    validateProtectedPlaybookMissionFile(result);
    return result;
}

/** Local-only CLI. It writes a package with mode 0600 and never handles a private key. */
if (require.main === module) {
    const [approvalPath, sourceCheckout, proposedContentPath, outputPath, publicKeyPath] = process.argv.slice(2);
    if (!approvalPath || !sourceCheckout || !proposedContentPath || !outputPath) {
        throw new Error("Usage: mb03-mission-package <approval.json> <source-checkout> <proposed-content> <output.json> [operator-public.pem]");
    }
    const approval = JSON.parse(boundedRegularFile(approvalPath, 64 * 1024)) as SignedHostedMissionApproval;
    const publicPem = publicKeyPath ? boundedRegularFile(publicKeyPath, 16 * 1024) : undefined;
    const packageFile = buildProtectedPlaybookMissionFile(approval, sourceCheckout, proposedContentPath, publicPem);
    const destination = resolve(outputPath);
    writeFileSync(destination, JSON.stringify(packageFile), { encoding: "utf8", mode: 0o600, flag: "wx" });
    chmodSync(destination, 0o600);
    process.stdout.write(JSON.stringify({ status: "PACKAGED", missionId: approval.payload.missionId, output: destination }) + "\n");
}
