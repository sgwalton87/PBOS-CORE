/*
===============================================================================

PBOS Compiler Types

===============================================================================
*/

export type CompilationStage =

    | "MISSION_PLANNING"

    | "ENGINEERING"

    | "VALIDATION"

    | "CERTIFICATION"

    | "RELEASE";

export interface CompilerArtifact {

    readonly id: string;

    readonly stage: CompilationStage;

    readonly generatedFrom: string;

    readonly certified: boolean;

}
