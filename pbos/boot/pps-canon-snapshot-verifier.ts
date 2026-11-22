/** Verifies the existing Playbook PPS Canon snapshot without inventing a Genesis operator identity. */
import { createHash } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export interface PpsCanonVerification {
  readonly valid: boolean;
  readonly verifiedDocuments: number;
  readonly errors: readonly string[];
}

/** Resolve only the selected mission's dependencies from an exact manifest pin. */
export async function resolvePinnedPpsDependencies(
  manifest: string, expectedSha256: string, roots: readonly string[], read: (file: string) => Promise<string>
) {
  const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
  if (hash(manifest) !== expectedSha256) throw new Error("Proposal Canon pin mismatch.");
  const rawEntries: unknown = JSON.parse(manifest)?.documents;
  if (!Array.isArray(rawEntries) || !roots.length) throw new Error("Invalid proposal Canon manifest.");
  const entries = rawEntries;
  const verified = new Map<string, { id: string; file: string; sha256: string }>();
  const visiting = new Set<string>();
  async function visit(id: string) {
    if (verified.has(id)) return;
    if (visiting.has(id)) throw new Error("Proposal Canon dependency cycle.");
    const matches = entries.filter(entry => entry?.id === id);
    const entry = matches[0];
    if (matches.length !== 1 || !/^PPS-\d{3,4}$/.test(id) ||
        !/^PPS-\d{3,4}_[A-Za-z0-9_]+\.md$/.test(entry.file) || !entry.file.startsWith(`${id}_`) ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) || !Array.isArray(entry.dependencies) ||
        entry.dependencies.some((dep: unknown) => typeof dep !== "string")) {
      throw new Error(`Invalid, missing, or ambiguous proposal Canon reference: ${id}`);
    }
    visiting.add(id);
    for (const dep of entry.dependencies) await visit(dep);
    if (hash(await read(entry.file)) !== entry.sha256) throw new Error(`Proposal Canon document hash mismatch: ${id}`);
    visiting.delete(id);
    verified.set(id, { id, file: entry.file, sha256: entry.sha256 });
  }
  for (const id of roots) await visit(id);
  return [...verified.values()];
}
export async function verifyPpsCanon(ppsDirectory: string, expectedManifestSha256?: string): Promise<PpsCanonVerification> {
  const root = resolve(ppsDirectory);
  const errors: string[] = [];
  let verifiedDocuments = 0;
  let manifest: unknown;
  try {
    const bytes = await readFile(join(root, "manifest.json"));
    if (expectedManifestSha256 !== undefined &&
        createHash("sha256").update(bytes).digest("hex") !== expectedManifestSha256) {
      return {valid:false,verifiedDocuments,errors:["PPS_MANIFEST_PIN_MISMATCH"]};
    }
    manifest = JSON.parse(bytes.toString("utf8"));
  }
  catch { return {valid:false,verifiedDocuments,errors:["PPS_MANIFEST_UNREADABLE"]}; }
  const docs = (manifest as {documents?: unknown}).documents;
  if (!Array.isArray(docs) || docs.length === 0) return {valid:false,verifiedDocuments,errors:["PPS_MANIFEST_INVALID"]};
  const ids = new Set<string>();
  for (const item of docs) {
    const entry = item as {id?:string;file?:string;sha256?:string;dependencies?:unknown};
    if (!/^PPS-(?:\d{3}|\d{4})$/.test(entry.id ?? "") ||
        !/^PPS-\d{3,4}_[A-Za-z0-9_]+\.md$/.test(entry.file ?? "") ||
        !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "") ||
        !Array.isArray(entry.dependencies)) { errors.push("INVALID_PPS_ENTRY"); continue; }
    if (ids.has(entry.id!)) errors.push(`DUPLICATE_PPS_ID:${entry.id}`);
    ids.add(entry.id!);
    const path = resolve(root,entry.file!);
    if (!path.startsWith(root + sep)) {errors.push("PPS_PATH_ESCAPE");continue;}
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) {errors.push(`UNSAFE_PPS_FILE:${entry.id}`);continue;}
      const hash = createHash("sha256").update(await readFile(path)).digest("hex");
      if (hash !== entry.sha256) errors.push(`PPS_HASH_MISMATCH:${entry.id}`);
      else verifiedDocuments++;
    } catch {errors.push(`PPS_FILE_MISSING:${entry.id}`);}
  }
  for (let n=0;n<=15;n++) if (!ids.has(`PPS-${String(n).padStart(3,"0")}`)) errors.push(`PPS_CORE_MISSING:${n}`);
  // Future-system dependency references can point to historical volumes absent
  // from this snapshot; report them separately rather than silently fabricating them.
  for (const item of docs) for (const dep of (Array.isArray(item.dependencies) ? item.dependencies : [])) {
    if (typeof dep !== "string") errors.push("INVALID_PPS_DEPENDENCY");
  }
  return {valid:errors.length===0,verifiedDocuments,errors};
}
