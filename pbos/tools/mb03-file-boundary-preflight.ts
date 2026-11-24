/**
 * Read-only boundary probe for protected MB-03 runtime inputs.
 * Emits only field identifiers and stable diagnostic codes, never paths,
 * metadata values, contents or credentials. No mission admission or nonce use.
 */
import { lstatSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type ProtectedFileIssue =
    "MISSING" | "REDIRECTED" | "NOT_REGULAR" | "EMPTY" | "TOO_LARGE" | "EXPOSED" | "UNREADABLE";

export function inspectProtectedFileBoundary(path: string, maximum: number): ProtectedFileIssue | null {
    if (!path || !Number.isSafeInteger(maximum) || maximum < 1) return "MISSING";
    const full = resolve(path);
    try {
        const meta = lstatSync(full);
        if (meta.isSymbolicLink() || realpathSync(full) !== full ||
            realpathSync(dirname(full)) !== dirname(full)) return "REDIRECTED";
        if (!meta.isFile()) return "NOT_REGULAR";
        if (meta.size < 1) return "EMPTY";
        if (meta.size > maximum) return "TOO_LARGE";
        if ((meta.mode & 0o077) !== 0) return "EXPOSED";
        return null;
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        return code === "ENOENT" || code === "ENOTDIR" ? "MISSING" : "UNREADABLE";
    }
}

export const MB03_BOUNDARY_INPUTS = [
    ["PBOS_APPROVAL_PUBLIC_KEY_FILE", 16_384],
    ["PBOS_PROVIDER_PUBLIC_KEY_FILE", 16_384],
    ["PBOS_PROVIDER_SIGNING_KEY_FILE", 32_768],
    ["PBOS_MISSION_INPUT_FILE", 1024 * 1024],
    ["PBOS_DISPOSABLE_STATE_FILE", 32 * 1024 * 1024]
] as const;

/** No file contents are loaded and no mutation or network call is performed. */
export function inspectMb03FileBoundaries(
    env: NodeJS.ProcessEnv = process.env
): Readonly<{ schema: "pbos.mb03.file-boundary-preflight.v1"; status: "PASS" | "BLOCKED";
    results: readonly { field: string; status: "PASS" | ProtectedFileIssue }[] }> {
    const results = MB03_BOUNDARY_INPUTS.map(([field, max]) => ({
        field, status: (inspectProtectedFileBoundary(env[field] ?? "", max) ?? "PASS") as ProtectedFileIssue | "PASS"
    }));
    return {
        schema: "pbos.mb03.file-boundary-preflight.v1",
        status: results.every(item => item.status === "PASS") ? "PASS" : "BLOCKED",
        results
    };
}

if (require.main === module) {
    const report = inspectMb03FileBoundaries();
    process.stdout.write(JSON.stringify(report) + "\n");
    if (report.status !== "PASS") process.exitCode = 2;
}
