import { ecosystemCandidatePath, loadEcosystemCandidates, MultiPlatformCertificationEngine } from "../ecosystem-certification";

export function compileEcosystemCertificationFile(path = ecosystemCandidatePath()): unknown {
    return new MultiPlatformCertificationEngine().evaluate(loadEcosystemCandidates(path));
}

if (require.main === module) {
    try { process.stdout.write(`${JSON.stringify(compileEcosystemCertificationFile(), null, 2)}\n`); }
    catch (error) {
        process.stderr.write(`Ecosystem certification report failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
