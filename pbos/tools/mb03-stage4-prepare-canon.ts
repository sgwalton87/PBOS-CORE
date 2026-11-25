/** Operator/staging-side packaging of an existing, pinned PPS snapshot. No network or Canon synthesis. */
import { createHash } from "node:crypto";
import { copyFileSync, chmodSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { verifyPpsCanon } from "../boot/pps-canon-snapshot-verifier";

const HASH = /^[a-f0-9]{64}$/;
const FILE = /^PPS-(?:\d{3}|\d{4})_[A-Za-z0-9_]+\.md$/;

export async function preparePinnedCanonSnapshot(sourceDirectory: string, destinationDirectory: string, expectedManifestHash: string) {
  if (!HASH.test(expectedManifestHash)) throw Error("An independently reviewed manifest SHA-256 is required.");
  const source = resolve(sourceDirectory), destination = resolve(destinationDirectory);
  if (source === destination || realpathSync(source) !== source || !lstatSync(source).isDirectory()) {
    throw Error("Source must be an existing canonical PPS directory.");
  }
  const bytes = readFileSync(join(source, "manifest.json"));
  const manifestHash = createHash("sha256").update(bytes).digest("hex");
  if (manifestHash !== expectedManifestHash) throw Error("PPS manifest does not match the approved pin.");
  const manifest: unknown = JSON.parse(bytes.toString("utf8"));
  const documents = (manifest as { documents?: unknown })?.documents;
  if (!Array.isArray(documents) || !documents.length) throw Error("Invalid PPS manifest.");
  const names = new Set<string>(["manifest.json"]);
  for (const record of documents) {
    const doc = record as { file?: unknown };
    if (typeof doc?.file !== "string" || !FILE.test(doc.file) || names.has(doc.file)) {
      throw Error("Unsafe or duplicate PPS document path.");
    }
    names.add(doc.file);
  }
  const verifiedSource = await verifyPpsCanon(source, expectedManifestHash);
  if (!verifiedSource.valid || verifiedSource.verifiedDocuments !== documents.length) {
    throw Error("Source PPS documents failed complete integrity verification.");
  }
  // Deliberately refuses to replace or modify any existing destination.
  let created = false;
  try {
    mkdirSync(destination, { mode: 0o700 });
    created = true;
    for (const name of names) {
      if (basename(name) !== name) throw Error("Unsafe PPS filename.");
      const sourcePath = join(source, name);
      const info = lstatSync(sourcePath);
      if (!info.isFile() || info.isSymbolicLink()) throw Error("Unsafe PPS source file.");
      copyFileSync(sourcePath, join(destination, name), 1 /* COPYFILE_EXCL */);
      chmodSync(join(destination, name), 0o400);
    }
    const verifiedCopy = await verifyPpsCanon(destination, expectedManifestHash);
    if (!verifiedCopy.valid || verifiedCopy.verifiedDocuments !== documents.length) {
      throw Error("Copied PPS snapshot did not preserve Canon integrity.");
    }
    chmodSync(destination, 0o500);
    return { status: "PINNED_CANON_SNAPSHOT_READY", manifestSha256: manifestHash,
      documentsVerified: verifiedCopy.verifiedDocuments, directory: destination, readOnly: true };
  } catch (error) {
    if (created) rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

if (require.main === module) {
  const [source, destination, pin] = process.argv.slice(2);
  if (!source || !destination || !pin) {
    process.stderr.write("Usage: tsx mb03-stage4-prepare-canon.ts <source-PPS-dir> <new-private-dir> <approved-manifest-sha256>\n");
    process.exitCode = 2;
  } else {
    preparePinnedCanonSnapshot(source, destination, pin).then(result => {
      process.stdout.write(JSON.stringify(result) + "\n");
    }).catch(() => {
      process.stderr.write("Canon packaging BLOCKED. No Canon content or pin was modified.\n");
      process.exitCode = 2;
    });
  }
}
