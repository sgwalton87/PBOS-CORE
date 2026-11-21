import { execFile } from "node:child_process";
import type { KeyObject } from "node:crypto";
import { promisify } from "node:util";
import { OperatorIdentityService } from "../genesis-state";
import { GenesisStateRepository, verifyDisposableEvidence } from "../genesis-state/genesis-state-repository";
import type { VerifiableApproval } from "../genesis-state/operator-identity";
import { NodeCommandRunner } from "../platform/github-repository-gateway";
import type { CommandRunner } from "../platform/github-repository-gateway";
import { isExactDisposableFile } from "./disposable-change-boundary";
import { mb03ApprovalScope } from "./mb03-disposable-mission";
import { inspectSignedMissionApproval } from "./signed-approval-evidence";
import { evidenceDigest, evidenceGitSha, evidenceJson, evidenceSha256, remoteKeyFingerprint, requireRemoteSignature } from "./remote-attestation";
import type { SignedRemoteEvidence } from "./remote-attestation";
import { verifyProvision, verifyRemoteReturn } from "./trusted-remote-worker";
import type { RemoteProvision, RemoteReturn, RemoteWorkerBinding, RemoteWorkerTrust } from "./trusted-remote-worker";

const git = promisify(execFile);
export const INDEPENDENT_VERIFICATION_DOMAIN = "pbos.mb031.independent-verification.v1";

export interface IndependentVerification {
    readonly runId: string;
    readonly buildDigest: string;
    readonly diffDigest: string;
    readonly proposalSha: string;
    readonly verifierId: string;
    readonly testResults: readonly Readonly<{ check: string; exitCode: number; logDigest: string }>[];
    readonly verificationDigest: string;
    readonly documentationDigest: string;
}

export interface GitHubVerificationPolicy {
    readonly baseRef: string;
    readonly workflowId: number;
    readonly workflowPath: string;
    readonly workflowDigest: string;
    readonly jobName: string;
}

export class GitHubDisposableProposalReader {
    constructor(private readonly commands: CommandRunner = new NodeCommandRunner()) {}

    async verify(repository: string, number: number, proposalSha: string, sourceSha: string, runId: number,
        policy: GitHubVerificationPolicy) {
        if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !evidenceGitSha(proposalSha) || !evidenceGitSha(sourceSha) ||
            ![number, runId, policy.workflowId].every(value => Number.isSafeInteger(value) && value > 0) ||
            !policy.baseRef || !policy.jobName || !evidenceSha256(policy.workflowDigest) ||
            !/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(policy.workflowPath)) throw new Error("Invalid GitHub evidence identity.");
        const root = `repos/${repository}`;
        const get = async (path: string) => JSON.parse((await this.commands.run("gh",
            ["api", "--hostname", "github.com", `${root}/${path}`], undefined, { timeoutMs: 15_000 })).stdout);
        const run = await get(`actions/runs/${runId}`);
        if (run.id !== runId || run.head_sha !== proposalSha || run.workflow_id !== policy.workflowId ||
            run.path !== policy.workflowPath || run.repository?.full_name !== repository || run.event !== "workflow_dispatch" ||
            run.status !== "completed" || run.conclusion !== "success" || !Number.isSafeInteger(run.run_attempt)) {
            throw new Error("Trusted exact-head GitHub CI was not verified.");
        }
        const jobs = await get(`actions/runs/${runId}/attempts/${run.run_attempt}/jobs`);
        const matching = jobs.jobs?.filter((job: { name: string }) => job.name === policy.jobName) ?? [];
        if (matching.length !== 1 || matching[0].status !== "completed" || matching[0].conclusion !== "success") {
            throw new Error("Required GitHub CI job was not verified.");
        }
        const pr = await get(`pulls/${number}`);
        const url = `https://github.com/${repository}/pull/${number}`;
        if (pr.number !== number || pr.html_url !== url || pr.state !== "open" || pr.draft !== true ||
            pr.head?.sha !== proposalSha || pr.head?.repo?.full_name !== repository ||
            pr.base?.sha !== sourceSha || pr.base?.ref !== policy.baseRef || pr.base?.repo?.full_name !== repository) {
            throw new Error("Exact open draft GitHub proposal was not verified.");
        }
        return { url, runId, proposalSha, sourceSha, workflowId: policy.workflowId, runAttempt: run.run_attempt };
    }
}

interface VerificationTrust {
    readonly worker: RemoteWorkerTrust;
    readonly verifierId: string;
    readonly verifierPublicKey: KeyObject;
    readonly requiredTests: readonly string[];
    readonly github: GitHubVerificationPolicy;
}

interface ArchivedWorkerReceipt {
    readonly mode: "isolated-remote" | "fixture";
    readonly binding: RemoteWorkerBinding;
    readonly provision: SignedRemoteEvidence<RemoteProvision>;
    readonly receipt: SignedRemoteEvidence<RemoteReturn>;
    readonly manifest: readonly { path: string; digest: string }[];
}

export async function independentlyVerifyDisposableMission(state: GenesisStateRepository, identities: OperatorIdentityService,
    approval: VerifiableApproval, runId: string, signed: SignedRemoteEvidence<IndependentVerification>,
    artifacts: Readonly<{ checkout: string; verification: Buffer; documentation: Buffer; testLogs: ReadonlyMap<string, Buffer> }>,
    proposal: Readonly<{ number: number; ciRunId: number }>, trust: VerificationTrust,
    github = new GitHubDisposableProposalReader()) {
    state.assertDisposableAuthority(trust.worker.authorityId);
    if (remoteKeyFingerprint(trust.worker.publicKey) === remoteKeyFingerprint(trust.verifierPublicKey) || !trust.verifierId) {
        throw new Error("The independent verifier needs a distinct trusted identity.");
    }
    const { run, activeLease, evidence } = state.inspectDisposableRun(runId);
    if (activeLease || !run.disposableAttempt?.workerFinishedAt || run.disposableAttempt.quarantine ||
        evidence.length !== 3 || !verifyDisposableEvidence(evidence)) throw new Error("Authoritative BUILD evidence is incomplete.");
    const [select, plan, build] = evidence;
    const providerDigest = build.payload.providerReceiptDigest;
    if (build.payload.source !== "provider-attested-return" || !evidenceSha256(providerDigest)) {
        throw new Error("Provider-attested BUILD receipt is required.");
    }
    const archived = trust.worker.archive.read(providerDigest) as ArchivedWorkerReceipt;
    const { binding } = archived;
    const { mission } = binding;
    const attempt = run.disposableAttempt;
    const scope = mb03ApprovalScope(mission);
    const lease = state.executionLeases().find(item => item.runId === runId && item.leaseId === binding.fence);
    const dispatchedAt = Date.parse(attempt.workerStartedAt ?? "");
    const returnedAt = Date.parse(attempt.workerFinishedAt ?? "");
    if ((archived.mode !== "isolated-remote" && !(archived.mode === "fixture" && trust.worker.allowFixture)) ||
        !lease || lease.status !== "RELEASED" || binding.authorityId !== trust.worker.authorityId ||
        run.authorizationArtifactId !== approval.approvalId || run.actorId !== approval.operatorId ||
        attempt.missionId !== mission.missionId || attempt.attemptId !== mission.attemptId || attempt.namespace !== mission.stateNamespace ||
        run.repository !== mission.repository || run.startingCommit !== mission.sourceSha || attempt.scopeDigest !== evidenceDigest(scope.resource) ||
        attempt.approvalDigest !== evidenceDigest(approval.signature) || binding.approvalDigest !== attempt.approvalDigest ||
        !run.executionPlan || plan.payload.planHash !== evidenceDigest(JSON.stringify(run.executionPlan)) ||
        select.payload.missionId !== mission.missionId || select.payload.workerId !== mission.workerId ||
        evidenceJson(plan.payload.allowedPaths) !== evidenceJson(mission.allowedPaths) ||
        !evidence.every(record => record.sourceSha === run.startingCommit && record.approvalDigest === attempt.approvalDigest &&
            record.attemptId === attempt.attemptId) ||
        !inspectSignedMissionApproval(identities, approval, { mission, ...scope }, new Date(dispatchedAt)) ||
        !(Date.parse(binding.deadline) <= Date.parse(approval.expiresAt))) throw new Error("Worker and operator authorization binding rejected.");
    const provisionedAt = Date.parse(archived.provision.payload.issuedAt);
    if (!(provisionedAt >= dispatchedAt && provisionedAt <= returnedAt)) throw new Error("Provision is outside the dispatch window.");
    const provision = verifyProvision(binding, archived.provision, trust.worker, provisionedAt);
    const returned = verifyRemoteReturn(binding, provision, archived.receipt, trust.worker.publicKey,
        Date.parse(archived.receipt.payload.completedAt));
    if (!(Date.parse(returned.completedAt) <= returnedAt) || returned.outputsDigest !== evidenceDigest(evidenceJson(archived.manifest)) ||
        evidenceDigest(returned.outputsDigest) !== build.payload.outputDigest) throw new Error("Worker return evidence is inconsistent.");
    const statement = requireRemoteSignature(INDEPENDENT_VERIFICATION_DOMAIN,
        { payload: structuredClone(signed.payload), signature: signed.signature }, trust.verifierPublicKey);
    if (Object.keys(statement).sort().join(",") !== "buildDigest,diffDigest,documentationDigest,proposalSha,runId,testResults,verificationDigest,verifierId" ||
        !Array.isArray(statement.testResults) || statement.testResults.some(item => Object.keys(item).sort().join(",") !== "check,exitCode,logDigest") ||
        statement.verifierId !== trust.verifierId || statement.runId !== runId || statement.buildDigest !== build.digest ||
        statement.diffDigest !== build.payload.diffDigest || !evidenceGitSha(statement.proposalSha) ||
        statement.verificationDigest !== evidenceDigest(artifacts.verification) || !artifacts.verification.length ||
        statement.documentationDigest !== evidenceDigest(artifacts.documentation) || !artifacts.documentation.length) {
        throw new Error("Independent scope or artifact attestation rejected.");
    }
    const checks = statement.testResults.map(item => item.check).sort();
    if (!checks.length || new Set(checks).size !== checks.length || new Set(trust.requiredTests).size !== trust.requiredTests.length ||
        evidenceJson(checks) !== evidenceJson([...trust.requiredTests].sort()) || statement.testResults.some(item => {
            const log = artifacts.testLogs.get(item.check);
            return item.exitCode !== 0 || !log?.length || evidenceDigest(log) !== item.logDigest;
        })) throw new Error("Required independent tests were not attested.");

    const readGit = async (...args: string[]) => (await git("git", args, {
        cwd: artifacts.checkout, encoding: "buffer", timeout: 10_000, maxBuffer: 4 * 1024 * 1024,
    })).stdout as Buffer;
    for (const revision of [mission.sourceSha, statement.proposalSha]) {
        if (evidenceDigest(await readGit("show", `${revision}:${trust.github.workflowPath}`)) !== trust.github.workflowDigest) {
            throw new Error("Proposal CI workflow does not match the trusted definition.");
        }
    }
    const parent = (await readGit("rev-list", "--parents", "-n", "1", statement.proposalSha)).toString().trim();
    if (parent !== `${statement.proposalSha} ${mission.sourceSha}`) throw new Error("Proposal source is not the exact single parent.");
    const diff = await readGit("diff", "--no-ext-diff", "--no-textconv", "--binary", mission.sourceSha, statement.proposalSha);
    const changes = (await readGit("diff", "--name-status", "--no-renames", "-z", mission.sourceSha, statement.proposalSha))
        .toString().split("\0").slice(0, -1);
    const paths = changes.filter((_entry, index) => index % 2 === 1).sort();
    if (evidenceDigest(diff) !== statement.diffDigest || changes.length !== paths.length * 2 ||
        changes.some((entry, index) => index % 2 === 0 && entry !== "M") ||
        evidenceJson(paths) !== evidenceJson([...archived.manifest.map(item => item.path)].sort()) ||
        evidenceJson(paths) !== evidenceJson([...(build.payload.changedPaths as readonly string[])].sort())) {
        throw new Error("Proposal diff does not match verified worker scope.");
    }
    for (const { path, digest } of archived.manifest) {
        if (!isExactDisposableFile(path) || !mission.allowedPaths.includes(path)) throw new Error("Proposal path is outside the signed scope.");
        const tree = (await readGit("ls-tree", "-z", statement.proposalSha, "--", path)).toString();
        if (!/^100(?:644|755) blob [0-9a-f]+\t/.test(tree) ||
            evidenceDigest(await readGit("show", `${statement.proposalSha}:${path}`)) !== digest) {
            throw new Error("Proposal file content is inconsistent with the provider receipt.");
        }
    }
    const ci = await github.verify(mission.repository, proposal.number, statement.proposalSha, mission.sourceSha, proposal.ciRunId, trust.github);
    const archiveDigest = trust.worker.archive.preserve({
        mode: archived.mode, statement: { payload: statement, signature: signed.signature }, ci, providerDigest,
    });
    const records = state.completeDisposableEvidence(runId, build.digest, [
        { stage: "TEST", payload: { diffDigest: statement.diffDigest, testResultsDigest: evidenceDigest(evidenceJson(statement.testResults)), archiveDigest } },
        { stage: "VERIFY", payload: { diffDigest: statement.diffDigest, verificationDigest: statement.verificationDigest, archiveDigest } },
        { stage: "DOCUMENT", payload: { documentationDigest: statement.documentationDigest, archiveDigest } },
        { stage: "PROPOSE", payload: { proposalSha: statement.proposalSha, ciHeadSha: ci.proposalSha, ciReceiptDigest: evidenceDigest(evidenceJson(ci)), archiveDigest } },
    ]);
    return { mode: archived.mode, records, archiveDigest };
}
