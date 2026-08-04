import { execFile } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { promisify } from "util";
import { BuildAuthorityService } from "../autonomous-authority";
import { GenesisStateRepository, OperatorIdentityService, PersistentAuthorityLedger, PersistentBuildGrantRegistry } from "../genesis-state";
import { GitHubRepositoryGateway } from "../platform";
import { REFERENCE_SYSTEMS } from "./system-definition";
import { GenesisControlPlane } from "./genesis-control-plane";
import { GenesisSystemCatalog } from "./system-catalog";
import { GenesisTerminal, SessionAuthorityProvider } from "./genesis-terminal";
import { GenesisWorkflowService } from "./genesis-workflow-service";
import { NodeTerminalIO } from "./terminal-io";
import { SystemIntakeTerminal } from "./system-intake-terminal";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { createDefaultRemediationHandler, GitHubCheckCollector, ResumableRemediationEngine } from "../validation-automation";
import { NodeCommandRunner } from "../platform";

interface LocalProfile { readonly operatorId: string; readonly credential: string; readonly organizationId: string; readonly githubLogin: string; }
const stateRoot = process.env.PBOS_STATE_HOME ?? join(homedir(), ".pbos");
const profilePath = join(stateRoot, "profile.json");
const operatorsPath = join(stateRoot, "operators.json");
const genesisPath = join(stateRoot, "genesis-state.json");

async function login(): Promise<number> {
    const run = promisify(execFile);
    await run("gh", ["auth", "status"]);
    const githubLogin = (await run("gh", ["api", "user", "--jq", ".login"])).stdout.trim();
    const terminal = createInterface({ input: stdin, output: stdout });
    const organizationId = (await terminal.question("PBOS organization ID: ")).trim();
    const displayName = (await terminal.question("Operator display name: ")).trim();
    terminal.close();
    const enrolled = new OperatorIdentityService(operatorsPath).enroll(organizationId, displayName);
    mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
    const profile: LocalProfile = { operatorId: enrolled.operator.operatorId, credential: enrolled.credential, organizationId, githubLogin };
    writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    stdout.write(`PBOS login complete for ${displayName} (${githubLogin}) in ${organizationId}.\n`);
    return 0;
}

function profile(): LocalProfile {
    try { return JSON.parse(readFileSync(profilePath, "utf8")) as LocalProfile; }
    catch { throw new Error("PBOS login required. Run: pbos login"); }
}

async function launch(): Promise<number> {
    const local = profile();
    const identities = new OperatorIdentityService(operatorsPath);
    const operator = identities.authenticate(local.operatorId, local.credential);
    const state = new GenesisStateRepository(genesisPath);
    if (state.systems().length === 0) REFERENCE_SYSTEMS.forEach(system => state.saveSystem(system));
    const grants = new PersistentBuildGrantRegistry(state);
    const authority = new BuildAuthorityService(grants, new PersistentAuthorityLedger(state));
    const control = new GenesisControlPlane(new GenesisSystemCatalog(state.systems()), authority, state);
    const sessionAuthority: SessionAuthorityProvider = { authorize: async systemId => {
        const approval = identities.approve(operator, "ISSUE_BUILD_GRANT", systemId, 15);
        if (!identities.verify(approval, "ISSUE_BUILD_GRANT", systemId)) throw new Error("Build grant approval verification failed.");
        state.appendAudit({ eventId: approval.approvalId, type: "VERIFIABLE_APPROVAL", actorId: operator.operatorId,
            resource: systemId, occurredAt: approval.issuedAt, evidence: { approval } });
        return { operatorId: operator.operatorId, approvalId: approval.approvalId };
    } };
    const commands = new NodeCommandRunner();
    const gateway = new GitHubRepositoryGateway(join(stateRoot, "repositories"), commands);
    const workflows = new GenesisWorkflowService(
        gateway, undefined, undefined,
        (session, action, risk, branch) => control.authorizeAction(session.sessionId, action, risk, branch)
    );
    const remediation = new ResumableRemediationEngine(state, new GitHubCheckCollector(commands), createDefaultRemediationHandler(gateway));
    return new GenesisTerminal(control, new NodeTerminalIO(), new SystemIntakeTerminal(undefined, blueprint => state.saveBlueprint(blueprint)),
        sessionAuthority, workflows, remediation).run();
}

export async function runPbosCli(args = process.argv.slice(2)): Promise<number> {
    if (args[0] === "login") return login();
    if (args[0] === "status") {
        const local = profile();
        stdout.write(`Authenticated organization: ${local.organizationId}\nGitHub account: ${local.githubLogin}\nOperator: ${local.operatorId}\n`);
        return 0;
    }
    if (args.length > 0) throw new Error(`Unknown PBOS command: ${args.join(" ")}`);
    return launch();
}
