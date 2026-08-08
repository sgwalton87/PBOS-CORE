import { readFile, stat } from "fs/promises";
import { isAbsolute } from "path";
import { parse } from "dotenv";
import { FunctionalRuntimeCommand, ProtectedEnvironmentFile } from "./contracts";

export interface ProtectedEnvironmentReadiness {
    readonly ready: boolean;
    readonly required: readonly string[];
    readonly available: readonly string[];
    readonly missing: readonly string[];
    readonly loadedFiles: readonly string[];
}

export class ProtectedEnvironmentResolver {
    constructor(private readonly processEnvironment: NodeJS.ProcessEnv = process.env) {}

    async inspect(commands: readonly FunctionalRuntimeCommand[],
        files: readonly ProtectedEnvironmentFile[] = []): Promise<ProtectedEnvironmentReadiness> {
        const required = [...new Set(commands.flatMap(command => command.requiredEnvironmentVariables ?? []))].sort();
        const loaded = await this.load(files);
        const values = { ...loaded.values, ...this.defined(this.processEnvironment) };
        const available = required.filter(name => this.isConfigured(values[name]));
        return { ready: available.length === required.length, required, available,
            missing: required.filter(name => !available.includes(name)), loadedFiles: loaded.files };
    }

    async resolve(commands: readonly FunctionalRuntimeCommand[],
        files: readonly ProtectedEnvironmentFile[] = []): Promise<NodeJS.ProcessEnv> {
        const publicEnvironment: Record<string, string> = {};
        const protectedNames = new Set(commands.flatMap(command => command.requiredEnvironmentVariables ?? []));
        for (const command of commands) {
            for (const [name, value] of Object.entries(command.publicEnvironment ?? {})) {
                if (protectedNames.has(name)) throw new Error(`Protected environment ${name} cannot be supplied as public runtime configuration.`);
                if (publicEnvironment[name] !== undefined && publicEnvironment[name] !== value) {
                    throw new Error(`Conflicting public runtime configuration: ${name}.`);
                }
                publicEnvironment[name] = value;
            }
        }
        const readiness = await this.inspect(commands, files);
        if (!readiness.ready) {
            throw new Error(`Functional runtime is missing protected environment: ${readiness.missing.join(", ")}. ` +
                "Run `pbos doctor playbook` for the non-secret setup locations.");
        }
        const loaded = await this.load(files);
        const protectedValues = Object.fromEntries(Object.entries(loaded.values).filter(([name]) => protectedNames.has(name)));
        const processProtected = Object.fromEntries([...protectedNames]
            .flatMap(name => typeof this.processEnvironment[name] === "string" && this.processEnvironment[name]
                ? [[name, this.processEnvironment[name]!]] as const : []));
        const safeRuntimeNames = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TZ", "CI",
            "NODE_ENV", "NODE_OPTIONS", "npm_config_cache"] as const;
        const safeRuntime = Object.fromEntries(safeRuntimeNames
            .flatMap(name => typeof this.processEnvironment[name] === "string" && this.processEnvironment[name]
                ? [[name, this.processEnvironment[name]!]] as const : []));
        return { ...safeRuntime, ...protectedValues, ...processProtected, ...publicEnvironment };
    }

    private async load(files: readonly ProtectedEnvironmentFile[]): Promise<Readonly<{
        values: Readonly<Record<string, string>>; files: readonly string[];
    }>> {
        const values: Record<string, string> = {};
        const loaded: string[] = [];
        for (const source of files) {
            if (!isAbsolute(source.path)) throw new Error(`Protected environment path must be absolute: ${source.path}`);
            let metadata;
            try { metadata = await stat(source.path); }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT" && !source.required) continue;
                if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Required protected environment file is missing: ${source.path}`);
                throw error;
            }
            if (!metadata.isFile()) throw new Error(`Protected environment source is not a regular file: ${source.path}`);
            if ((metadata.mode & 0o077) !== 0) {
                throw new Error(`Protected environment file permissions are unsafe: ${source.path}. Run: chmod 600 "${source.path}"`);
            }
            Object.assign(values, parse(await readFile(source.path, "utf8")));
            loaded.push(source.path);
        }
        return { values, files: loaded };
    }

    private defined(environment: NodeJS.ProcessEnv): Record<string, string> {
        return Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] =>
            typeof entry[1] === "string" && entry[1].length > 0));
    }

    private isConfigured(value: string | undefined): boolean {
        const candidate = value?.trim() ?? "";
        if (!candidate) return false;
        return !(/^(?:\.\.\.|<[^>]+>|your[_ -].+|replace[_ -].+|change[_ -]?me|todo)$/i.test(candidate) ||
            /^(?:your|replace)[_-].*?(?:id|token|key|secret)(?:[_-]here)?$/i.test(candidate) ||
            /^(?:project|team)[_-]id[_-]here$/i.test(candidate) || /^(?:token|key|secret)[_-]here$/i.test(candidate));
    }
}
