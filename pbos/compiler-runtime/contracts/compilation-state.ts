export type CompilationState =
    | "INITIALIZED"
    | "ACQUIRING"
    | "ANALYZING"
    | "COMPILING"
    | "VALIDATING"
    | "CERTIFIED"
    | "FAILED";

export interface CompilationStateTransition {
    readonly from?: CompilationState;
    readonly to: CompilationState;
    readonly stageId?: string;
    readonly transitionedAt: Date;
}
