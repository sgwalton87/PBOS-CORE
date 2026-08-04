import { SystemRegistry } from "../../acquisition-engine";
import { CompilationResult } from "../contracts/compilation-result";
import { CompilationOrchestrator } from "./compilation-orchestrator";

export class GenesisCompiler {
    constructor(
        private readonly registry: SystemRegistry,
        private readonly orchestrator = new CompilationOrchestrator()
    ) {}

    compile(targetSystemId: string): CompilationResult {
        const target = this.registry.get(targetSystemId);
        if (!target) {
            throw new Error(`Registered system target not found: ${targetSystemId}`);
        }
        return this.orchestrator.compile(target);
    }
}
