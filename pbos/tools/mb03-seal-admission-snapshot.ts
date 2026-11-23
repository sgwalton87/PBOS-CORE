/** Operator-side packaging only. No network, credential output, or state changes. */
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { readAdmissionKey, sealAdmissionSnapshot } from "../production-runtime/sealed-admission-snapshot";

try {
    const [expectedPin, keyPath, output, ...paths] = process.argv.slice(2);
    if (!expectedPin || !keyPath || !output || paths.length !== 3) {
        throw Error("Supply the reviewed pin, key file, output file, profile, operator records, and audited state.");
    }
    const files: Buffer[] = [];
    const key = readAdmissionKey(keyPath);
    try {
        for (const path of paths) {
            const stat = lstatSync(path);
            if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 24 * 1024 * 1024 ||
                (process.getuid !== undefined && stat.uid !== process.getuid())) {
                throw Error("Unapproved snapshot source file metadata.");
            }
            files.push(readFileSync(path));
        }
        writeFileSync(output, sealAdmissionSnapshot(files, key, expectedPin), { flag: "wx", mode: 0o600 });
        process.stdout.write("Wrote one sealed admission snapshot.\n");
    } finally {
        key.fill(0);
        for (const file of files) file.fill(0);
    }
} catch {
    process.stderr.write("Admission snapshot sealing failed. No existing files were replaced.\n");
    process.exitCode = 2;
}
