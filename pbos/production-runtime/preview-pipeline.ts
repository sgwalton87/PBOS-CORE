import { randomUUID } from "crypto";
import { PreviewManifest } from "./contracts";

export interface PreviewRequest {
    readonly runId: string;
    readonly repository: string;
    readonly branch: string;
    readonly commit: string;
    readonly experienceChanging: boolean;
    /** @deprecated Use webUrl. Retained for non-application preview compatibility. */
    readonly url?: string;
    readonly webUrl?: string;
    readonly mobileUrl?: string;
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
        const webUrl = request.webUrl ?? request.url;
        const mobileUrl = request.mobileUrl;
        [webUrl, mobileUrl].filter((value): value is string => Boolean(value)).forEach(value => {
            const parsed = new URL(value);
            if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Preview links must use HTTP or HTTPS.");
        });
        // A visual artifact proves appearance, not usability. Application delivery is
        // ready only when both governed interaction surfaces can actually be opened.
        const status = webUrl && mobileUrl ? "READY" : "REQUESTED";
        return { previewId: randomUUID(), runId: request.runId, repository: request.repository, branch: request.branch,
            commit: request.commit, status, url: webUrl, webUrl, mobileUrl, routes, personas, viewports, screenshots,
            generatedAt: new Date().toISOString(), label: request.label ?? "SEEDED" };
    }
}
