import { RepositoryReference } from "./repository-connector";

/**
 * Resolves the exact remote branch that owns the governed starting commit.
 *
 * A dependent application mission may stack on a still-open PBOS agent branch,
 * but it may never select an arbitrary or ungoverned branch. The returned
 * reference is used for fetch, exact-revision inspection, and the draft PR base.
 */
export function governedBuildReference(reference: RepositoryReference, startingBranch?: string): RepositoryReference {
    const branch = (startingBranch ?? reference.defaultBranch).trim();
    if (branch === reference.defaultBranch) return reference;
    if (!/^agent\/[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..") || branch.endsWith("/")) {
        throw new Error(`Stacked PBOS builds require the default branch or a governed agent/* branch: ${startingBranch ?? ""}`);
    }
    return { ...reference, defaultBranch: branch };
}
