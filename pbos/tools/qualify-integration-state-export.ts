import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { FileIntegrationStateRepository, type IdentityMapping } from "../integration";

export function qualifyIntegrationStateExport(directory: string) {
    const root = realpathSync(directory);
    if (basename(root) !== "pbos-disposable-qualification" || root !== directory ||
        !existsSync(join(root, ".pbos-disposable-qualification"))) {
        throw new Error("Use a canonical, explicitly marked disposable qualification export.");
    }
    const scratch = mkdtempSync(join(root, "qualification-"));
    try {
        const lock = join(scratch, "exclusive.lock");
        writeFileSync(lock, "parent", { flag: "wx", mode: 0o600 });
        const contender = execFileSync(process.execPath, ["-e", `
            const fs = require("fs");
            try { fs.writeFileSync(process.argv[1], "child", { flag:"wx" }); }
            catch (error) { if (error.code === "EEXIST") process.stdout.write("denied"); else throw error; }
        `, lock], { encoding: "utf8", timeout: 5_000, env: {} });
        if (contender !== "denied") throw new Error("Exclusive creation did not fence an independent writer.");
        const moved = join(scratch, "renamed");
        renameSync(lock, moved);
        if (existsSync(lock) || readFileSync(moved, "utf8") !== "parent") throw new Error("Rename did not preserve the file.");

        const state = join(scratch, "integration-state.json");
        const backup = join(scratch, "backup.json");
        const organization = "FIXTURE-ONLY";
        const newMapping = (id: string): IdentityMapping => ({
            mappingId: id, mappedAt: new Date("2026-01-01T00:00:00Z"),
            externalIdentity: { externalIdentityId: id, externalSystemId: "FIXTURE-SYSTEM", role: "SCHOLAR",
                active: true, authorityReferences: [] },
            pbosIdentity: { actorId: id, systemId: "FIXTURE-OS", role: "SCHOLAR",
                active: true, authorityContext: [], provenance: id },
        });
        let repository = new FileIntegrationStateRepository(state);
        repository.saveIdentity(organization, newMapping("fixture-one"));
        repository.backup(backup);
        const bytes = readFileSync(backup);
        if (!bytes.equals(readFileSync(state))) throw new Error("Backup bytes differ from the committed state.");
        repository = new FileIntegrationStateRepository(state);
        if (repository.identities(organization)[0]?.mappingId !== "fixture-one") throw new Error("Restart persistence failed.");
        repository.saveIdentity(organization, newMapping("fixture-two"));
        repository.restore(backup);
        const restored = new FileIntegrationStateRepository(state).identities(organization);
        if (restored.length !== 1 || restored[0].mappingId !== "fixture-one" ||
            !bytes.equals(readFileSync(backup))) throw new Error("Restore or backup preservation failed.");
        return { exclusiveCreate: "PASS", rename: "PASS", restart: "PASS", restore: "PASS",
            backupSha256: createHash("sha256").update(bytes).digest("hex") };
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

if (require.main === module) {
    try {
        process.stdout.write(JSON.stringify(qualifyIntegrationStateExport(process.argv[2])) + "\n");
    } catch {
        process.stderr.write("Disposable integration state qualification failed.\n");
        process.exitCode = 1;
    }
}
