import { readFileSync } from "node:fs";
import { ApplicationReadinessCompiler, ApplicationRepositoryInventory } from "../application-readiness";

export function compileApplicationReadinessFile(path = process.env.PBOS_APPLICATION_INVENTORY_PATH?.trim()): unknown {
    if (!path) throw new Error("Required application inventory path is missing: PBOS_APPLICATION_INVENTORY_PATH");
    const inventory = JSON.parse(readFileSync(path, "utf8")) as ApplicationRepositoryInventory;
    return new ApplicationReadinessCompiler().compile(inventory);
}

if (require.main === module) {
    try { process.stdout.write(`${JSON.stringify(compileApplicationReadinessFile(), null, 2)}\n`); }
    catch (error) {
        process.stderr.write(`Application readiness compilation failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
