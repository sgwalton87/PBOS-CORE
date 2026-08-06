import { readFile, readdir, stat } from "fs/promises";
import { join, relative, resolve } from "path";

export type ConstitutionalAuthorityState = "READY" | "BLOCKED";

export interface ConstitutionalAuthorityRecord {
    readonly id: string;
    readonly path: string;
    readonly state: ConstitutionalAuthorityState;
    readonly detail: string;
}

export interface ConstitutionalAuthorityReport {
    readonly state: ConstitutionalAuthorityState;
    readonly authorities: readonly ConstitutionalAuthorityRecord[];
    readonly blockers: readonly string[];
    readonly inspectedAt: string;
}

const EXPECTED_PPS = Array.from({ length: 16 }, (_value, index) => `PPS-${String(index).padStart(3, "0")}`);

async function files(directory: string): Promise<readonly string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && entry.name.endsWith(".md"))
        .map(entry => join(directory, entry.name)).sort();
}

async function constitutionalDocuments(directory: string): Promise<readonly string[]> {
    return (await files(directory)).filter(path => /^\d/.test(path.split("/").at(-1) ?? ""));
}

async function exists(path: string): Promise<boolean> {
    try { await stat(path); return true; } catch { return false; }
}

/**
 * Loads constitutional identity and dependency truth without inventing absent
 * authorities. Production boot can call assertReady once every inherited PPS
 * volume is present; audits can inspect the report without bypassing blockers.
 */
export class ConstitutionalAuthorityLoader {
    constructor(private readonly repositoryRoot = process.cwd()) {}

    async inspect(): Promise<ConstitutionalAuthorityReport> {
        const root = resolve(this.repositoryRoot);
        const ppsFiles = (await files(join(root, "docs"))).filter(path => /^PPS-\d{3}.*\.md$/.test(path.split("/").at(-1) ?? ""));
        const authorityFiles = [
            ...ppsFiles,
            ...await constitutionalDocuments(join(root, "pbos", "constitution", "PBS-5000-autonomous-software-production-runtime")),
            ...await constitutionalDocuments(join(root, "pbos", "constitution", "PBS-6000-distributed-platform-architecture"))
        ];
        const blockers: string[] = [];
        const authorities: ConstitutionalAuthorityRecord[] = [];
        const locations = new Map<string, string[]>();
        for (const path of authorityFiles) {
            const content = await readFile(path, "utf8");
            const ids = [...content.matchAll(/^id:\s*([^\s]+)\s*$/gm)].map(match => match[1]);
            const canonicalPath = relative(root, path);
            if (!content.trim()) blockers.push(`EMPTY_AUTHORITY:${canonicalPath}`);
            if (ids.length !== 1) blockers.push(`AMBIGUOUS_AUTHORITY:${canonicalPath}:${ids.length}`);
            const id = ids[0] ?? `UNIDENTIFIED:${canonicalPath}`;
            const known = locations.get(id) ?? [];
            locations.set(id, [...known, canonicalPath]);
            authorities.push({ id, path: canonicalPath, state: ids.length === 1 && content.trim() ? "READY" : "BLOCKED",
                detail: ids.length === 1 ? "One canonical identity resolved." : `Expected one identity; found ${ids.length}.` });
        }
        for (const [id, paths] of locations) if (paths.length > 1) blockers.push(`DUPLICATE_AUTHORITY:${id}:${paths.join(",")}`);

        const available = new Set([...locations.keys(), "PBS-5000", "PBS-6000"]);
        for (const id of EXPECTED_PPS) if (!available.has(id)) blockers.push(`MISSING_INHERITED_AUTHORITY:${id}`);

        const requiredPaths = [
            "pbos", "packages", "docs/organization-genome", "docs/architecture",
            "docs/PPS-006-PBOS-Constitutional-Execution-Modes.md",
            "pbos/constitution/PBS-5000-autonomous-software-production-runtime",
            "pbos/constitution/PBS-6000-distributed-platform-architecture"
        ];
        for (const path of requiredPaths) if (!await exists(join(root, path))) blockers.push(`MISSING_BOOT_PATH:${path}`);

        const graphPath = join(root, "pbos", "constitution", "PBS-6000-distributed-platform-architecture", "GRAPH.yaml");
        const graph = await readFile(graphPath, "utf8");
        const executableNodeKeys = [...graph.matchAll(/^nodes:\s*$/gm)].length;
        if (executableNodeKeys !== 1) blockers.push(`AMBIGUOUS_PLATFORM_GRAPH:nodes:${executableNodeKeys}`);
        return { state: blockers.length ? "BLOCKED" : "READY", authorities, blockers,
            inspectedAt: new Date().toISOString() };
    }

    async assertReady(): Promise<ConstitutionalAuthorityReport> {
        const report = await this.inspect();
        if (report.state !== "READY") throw new Error(`Constitutional boot blocked: ${report.blockers.join("; ")}`);
        return report;
    }
}
