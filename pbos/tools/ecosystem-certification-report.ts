import { readFileSync } from "node:fs";
import { EcosystemSystemCandidate, MultiPlatformCertificationEngine } from "../ecosystem-certification";

export function compileEcosystemCertificationFile(path = process.env.PBOS_ECOSYSTEM_CERTIFICATION_PATH?.trim()): unknown {
    if (!path) throw new Error("Required ecosystem certification input is missing: PBOS_ECOSYSTEM_CERTIFICATION_PATH");
    const candidates = JSON.parse(readFileSync(path, "utf8")) as EcosystemSystemCandidate[];
    return new MultiPlatformCertificationEngine().evaluate(candidates);
}

if (require.main === module) {
    try { process.stdout.write(`${JSON.stringify(compileEcosystemCertificationFile(), null, 2)}\n`); }
    catch (error) {
        process.stderr.write(`Ecosystem certification report failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
