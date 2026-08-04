import { SystemBlueprint } from "../system-blueprint";

export interface ApplicationStack {
    readonly framework: "NEXTJS";
    readonly language: "TYPESCRIPT";
    readonly database: "SUPABASE_POSTGRES";
    readonly authentication: "SUPABASE_AUTH";
    readonly deployment: "VERCEL";
}
export interface ScaffoldFile { readonly path: string; readonly content: string; }
export interface ApplicationScaffold {
    readonly scaffoldId: string;
    readonly blueprintId: string;
    readonly stack: ApplicationStack;
    readonly files: readonly ScaffoldFile[];
    readonly securityBoundaries: readonly string[];
    readonly generatedAt: Date;
}
export interface ScaffoldRequest { readonly blueprint: SystemBlueprint; readonly includeFirstVerticalSlice?: boolean; }
