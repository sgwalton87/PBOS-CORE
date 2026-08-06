import { SystemBlueprint } from "../system-blueprint";
import { RemediationRun } from "./contracts";

export interface RemediationPackContext {
    readonly run: RemediationRun;
    readonly blueprint: SystemBlueprint;
    readonly failureText: string;
}

export interface RemediationPackResult {
    readonly summary: string;
    readonly files: readonly { path: string; content: string }[];
    readonly replacements?: readonly { path: string; search: string; replacement: string }[];
    readonly prepareDependencyLock?: boolean;
}

export interface RemediationPack {
    readonly packId: string;
    readonly version: string;
    readonly category: "STACK" | "DATABASE" | "DOMAIN" | "QUALITY";
    supports(context: RemediationPackContext): boolean;
    remediate(context: RemediationPackContext): Promise<RemediationPackResult>;
}

export interface ProjectRemediationProfile {
    readonly systemId: string;
    readonly repository: string;
    readonly remediationPackIds: readonly string[];
    createBlueprint(): SystemBlueprint;
}
