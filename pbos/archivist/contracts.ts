export type ArchivistValidationState = "PASSED" | "FAILED";

export interface ArchivistValidationEvidence {
    readonly command: string;
    readonly state: ArchivistValidationState;
    readonly reference: string;
}

export interface ArchivistMilestoneRequest {
    readonly systemId: string;
    readonly systemName: string;
    readonly repository: string;
    readonly revision: string;
    readonly message: string;
    readonly progress: Readonly<Record<string, unknown>>;
    readonly validation: readonly ArchivistValidationEvidence[];
    readonly recordedAt: Date;
}

export interface ArchivistFile {
    readonly path: string;
    readonly content: string;
}

export interface ArchivistMilestoneRecord {
    readonly archiveId: string;
    readonly state: "VERIFIED" | "VALIDATION_FAILED";
    readonly digest: string;
    readonly lineage: readonly string[];
    readonly files: readonly ArchivistFile[];
}
