import { SystemRegistry } from "../acquisition-engine";
import { CertificationEngine, CertificationRequirement, SystemCertificationReport } from "../certification";
import { CompilationResult, GenesisCompiler } from "../compiler-runtime";
import {
    DomainTemplate,
    GeneratedSystemDefinition,
    SystemGenerator,
    SystemTemplate
} from "../factory";
import {
    EvolutionProposal,
    ImprovementOpportunity,
    ProposalGenerator
} from "../evolution-platform";

export interface DomainSystemGeneration {
    readonly system: GeneratedSystemDefinition;
    readonly generationId: string;
}

export interface EvolutionProposalRequest {
    readonly systemId: string;
    readonly opportunities: readonly ImprovementOpportunity[];
    readonly proposedChanges: readonly string[];
    readonly expectedOutcomes: Readonly<Record<string, unknown>>;
    readonly risks: readonly string[];
    readonly rollbackPlan: readonly string[];
}

/** Coordinates existing Genesis engines without owning domain behavior. */
export class GenesisSystemFactory {
    private readonly compiler: GenesisCompiler;

    constructor(
        registry: SystemRegistry,
        private readonly certification: CertificationEngine,
        private readonly generator = new SystemGenerator(),
        private readonly proposals = new ProposalGenerator()
    ) {
        this.compiler = new GenesisCompiler(registry);
    }

    compileSystem(systemId: string): CompilationResult {
        return this.compiler.compile(systemId);
    }

    generateDomainSystem(
        template: SystemTemplate,
        domains: readonly DomainTemplate[],
        systemName: string,
        ownerId: string
    ): DomainSystemGeneration {
        const plan = this.generator.plan(template, domains, systemName, ownerId);
        return { system: this.generator.generate(plan, template), generationId: plan.generationId };
    }

    certifySystem(
        systemId: string,
        requirements: readonly CertificationRequirement[]
    ): SystemCertificationReport {
        return this.certification.certify(systemId, requirements);
    }

    createEvolutionProposal(request: EvolutionProposalRequest): EvolutionProposal {
        return this.proposals.generate(
            request.systemId,
            request.opportunities,
            request.proposedChanges,
            request.expectedOutcomes,
            request.risks,
            request.rollbackPlan
        );
    }
}
