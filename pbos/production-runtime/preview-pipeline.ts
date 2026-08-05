import { randomUUID } from "crypto";
import { PreviewManifest } from "./contracts";

export interface PreviewRequest {
    readonly runId: string;
    readonly repository: string;
    readonly branch: string;
    readonly commit: string;
    readonly experienceChanging: boolean;
    readonly url?: string;
    readonly routes?: readonly string[];
    readonly personas?: readonly string[];
    readonly screenshots?: readonly string[];
    readonly label?: PreviewManifest["label"];
}

export class GovernedPreviewPipeline {
    compile(request: PreviewRequest): PreviewManifest {
        if (!request.runId.trim() || !request.repository.includes("/") || !/^[a-f0-9]{7,40}$/i.test(request.commit)) {
            throw new Error("Preview evidence requires exact run and repository lineage.");
        }
        if (!request.experienceChanging) return { previewId: randomUUID(), runId: request.runId, repository: request.repository,
            branch: request.branch, commit: request.commit, status: "NOT_APPLICABLE", routes: [], personas: [], viewports: [], screenshots: [],
            generatedAt: new Date().toISOString(), label: "NONVISUAL" };
        const routes = request.routes ?? []; const personas = request.personas ?? []; const screenshots = request.screenshots ?? [];
        const viewports = ["DESKTOP_1440X900", "MOBILE_390X844"];
        const status = request.url || screenshots.length ? "READY" : "REQUESTED";
        return { previewId: randomUUID(), runId: request.runId, repository: request.repository, branch: request.branch,
            commit: request.commit, status, url: request.url, routes, personas, viewports, screenshots,
            generatedAt: new Date().toISOString(), label: request.label ?? "SEEDED" };
    }
}
