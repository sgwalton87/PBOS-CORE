import { CapabilityKind, SystemBlueprint } from "../system-blueprint";

export interface ApplicationStack {
    readonly framework: "NEXTJS";
    readonly language: "TYPESCRIPT";
    readonly database: "SUPABASE_POSTGRES";
    readonly authentication: "SUPABASE_AUTH";
    readonly deployment: "VERCEL";
}
export interface ScaffoldFile { readonly path: string; readonly content: string; readonly executable?: boolean; }
export interface ApplicationScaffold {
    readonly scaffoldId: string;
    readonly blueprintId: string;
    readonly stack: ApplicationStack;
    readonly files: readonly ScaffoldFile[];
    readonly securityBoundaries: readonly string[];
    readonly mode: "NEW_APPLICATION" | "EXISTING_APPLICATION_OVERLAY";
    readonly dependencyLock: Readonly<{ manager: "NPM"; path: "package-lock.json"; required: boolean }>;
    readonly platformCapabilities: readonly ["PBOS_ENGINEERING_MEMORY"];
    readonly generatedAt: Date;
}
export interface ScaffoldRequest {
    readonly blueprint: SystemBlueprint;
    readonly includeFirstVerticalSlice?: boolean;
    /** Capabilities authorized in this work-package batch. Omit only for full new-system generation. */
    readonly capabilities?: readonly CapabilityKind[];
}
export interface ScaffoldMaterializationTarget {
    writeFiles(files: readonly ScaffoldFile[]): Promise<void>;
    prepareDependencyLock(manager: ApplicationScaffold["dependencyLock"]["manager"]): Promise<void>;
}
export interface MaterializedScaffold {
    readonly scaffoldId: string;
    readonly generatedPaths: readonly string[];
}
