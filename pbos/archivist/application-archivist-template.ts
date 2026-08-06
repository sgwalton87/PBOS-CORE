import type { ScaffoldFile } from "../application-scaffold/contracts";
import type { SystemBlueprint } from "../system-blueprint";

const archiveScript = String.raw`import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const config = JSON.parse(readFileSync(resolve(root, ".pbos/archivist.json"), "utf8"));
const message = process.argv.slice(2).join(" ").trim() || execFileSync("git", ["log", "-1", "--pretty=%B"], { cwd: root, encoding: "utf8" }).trim();
if (!/^milestone(?:\([^)]*\))?:\s+.+/i.test(message)) process.exit(0);
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).trim();
const discoveredRepository = remote.replace(/^https:\/\/github\.com\//, "").replace(/^git@github\.com:/, "").replace(/\.git$/, "");
const repository = config.repository === "ASSIGNED_AT_CREATION" ? discoveredRepository : config.repository;
const recordedAt = new Date();
const validation = config.validationCommands.map(command => {
  const result = spawnSync(command[0], command.slice(1), { cwd: root, encoding: "utf8", stdio: "inherit" });
  return { command: command.join(" "), state: result.status === 0 ? "PASSED" : "FAILED", reference: "local-command:" + command.join(" ") };
});
let progress = {};
if (config.progressFile && existsSync(resolve(root, config.progressFile))) progress = JSON.parse(readFileSync(resolve(root, config.progressFile), "utf8"));
const state = validation.every(item => item.state === "PASSED") ? "VERIFIED" : "VALIDATION_FAILED";
const timestamp = recordedAt.toISOString();
const stamp = timestamp.replaceAll(":", "-").replace("T", "_").replace(/\.\d{3}Z$/, "Z");
const slug = message.replace(/^milestone(?:\([^)]*\))?:\s*/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "milestone";
const canonical = JSON.stringify({ systemId: config.systemId, repository, revision, message, progress, validation, timestamp, state });
const digest = createHash("sha256").update(canonical).digest("hex");
const archiveId = "PBOS-ARCHIVE-" + digest.slice(0, 16).toUpperCase();
const evidence = validation.map(item => "- " + (item.state === "PASSED" ? "PASS" : "FAIL") + ": " + item.command + " — " + item.reference).join("\n");
const progressText = JSON.stringify(progress, null, 2).split("\n").map(line => "    " + line).join("\n");
const content = "# " + config.systemName + " Milestone\n\n- Archive: " + archiveId + "\n- System: " + config.systemId + "\n- Repository: " + repository + "\n- Revision: " + revision + "\n- Recorded: " + timestamp + "\n- State: " + state + "\n- Digest: sha256:" + digest + "\n\n## Milestone\n\n" + message + "\n\n## Validation Evidence\n\n" + evidence + "\n\n## Progress\n\n" + progressText + "\n";
const milestone = "docs/project-management/milestones/" + stamp + "-" + slug + ".md";
const snapshot = "docs/project-management/snapshots/" + stamp + "-" + slug + ".md";
for (const [path, value] of [[milestone, content], [snapshot, content], ["docs/project-management/snapshots/latest.md", content]]) {
  const target = resolve(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, value);
}
const index = resolve(root, "docs/project-management/milestones/index.md");
mkdirSync(dirname(index), { recursive: true });
if (!existsSync(index)) writeFileSync(index, "# PBOS Milestone Index\n");
appendFileSync(index, "\n- [" + timestamp + " — " + message + "](" + milestone.split("/").at(-1) + ") — " + state + " — " + revision + "\n");
const journal = resolve(root, "founders-journal/daily/" + timestamp.slice(0, 10) + ".md");
mkdirSync(dirname(journal), { recursive: true });
appendFileSync(journal, "\n## " + timestamp + " — " + message + "\n\n- System: " + config.systemName + " (" + config.systemId + ")\n- Revision: " + revision + "\n- Evidence state: " + state + "\n- Archive: " + archiveId + "\n");
console.log("PBOS Archivist: " + state + " — " + milestone);
if (state !== "VERIFIED") process.exitCode = 1;
`;

const installScript = String.raw`import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve, sep } from "node:path";
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
let hooksPath = ".githooks";
try { hooksPath = execFileSync("git", ["config", "--get", "core.hooksPath"], { cwd: root, encoding: "utf8" }).trim() || hooksPath; }
catch { execFileSync("git", ["config", "core.hooksPath", hooksPath], { cwd: root }); }
const dispatcher = resolve(root, hooksPath, "post-commit");
if (!dispatcher.startsWith(resolve(root) + sep)) throw new Error("Refusing to install a Git hook outside the repository.");
const marker = "# PBOS_ENGINEERING_MEMORY";
const invocation = "\n" + marker + "\nrepo_root=\"$(git rev-parse --show-toplevel)\"\n\"$repo_root/.githooks/pbos-archivist-post-commit\"\n";
mkdirSync(dirname(dispatcher), { recursive: true });
if (!existsSync(dispatcher)) writeFileSync(dispatcher, "#!/bin/sh\nset -eu\n");
if (!readFileSync(dispatcher, "utf8").includes(marker)) appendFileSync(dispatcher, invocation);
chmodSync(dispatcher, 0o755);
chmodSync(root + "/.githooks/pbos-archivist-post-commit", 0o755);
console.log("PBOS Archivist local hook installed for this clone.");
`;

const hook = `#!/bin/sh\nset -eu\n[ "\${PBOS_ARCHIVIST_DISABLED:-0}" = "1" ] && exit 0\nmessage="$(git log -1 --pretty=%B)"\nprintf '%s' "$message" | grep -Eiq '^Milestone(\\([^)]*\\))?:[[:space:]]+.+' || exit 0\nnode scripts/pbos-archive-milestone.mjs "$message"\n`;

const workflow = `name: PBOS Engineering Memory\non:\n  push:\npermissions:\n  contents: read\njobs:\n  archive:\n    if: startsWith(github.event.head_commit.message, 'Milestone:')\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - run: npm ci\n      - run: node scripts/pbos-archive-milestone.mjs "\${{ github.event.head_commit.message }}"\n      - if: always()\n        uses: actions/upload-artifact@v4\n        with:\n          name: pbos-engineering-memory-\${{ github.sha }}\n          path: |\n            docs/project-management/milestones/\n            docs/project-management/snapshots/\n            founders-journal/daily/\n`;

export function applicationArchivistFiles(blueprint: SystemBlueprint): ScaffoldFile[] {
    return [
        { path: ".pbos/archivist.json", content: `${JSON.stringify({
            version: 1,
            capability: "PBOS_ENGINEERING_MEMORY",
            systemId: blueprint.identity.proposedSystemId,
            systemName: blueprint.identity.systemName,
            repository: blueprint.application.existingRepository ?? "ASSIGNED_AT_CREATION",
            progressFile: "docs/project-management/project-progress.json",
            validationCommands: [["npm", "run", "typecheck"], ["npm", "test"], ["npm", "run", "build"]],
            persistence: "LOCAL_RECORDS_AND_CI_ARTIFACT"
        }, null, 2)}\n` },
        { path: "scripts/pbos-archive-milestone.mjs", content: archiveScript },
        { path: "scripts/pbos-install-archivist.mjs", content: installScript },
        { path: ".githooks/pbos-archivist-post-commit", content: hook, executable: true },
        { path: ".github/workflows/pbos-engineering-memory.yml", content: workflow },
        ...(blueprint.application.strategy === "CREATE_NEW"
            ? [{ path: "docs/project-management/milestones/index.md", content: "# PBOS Milestone Index\n\nMilestone evidence is generated from qualifying `Milestone:` commits.\n" }]
            : [])
    ];
}
