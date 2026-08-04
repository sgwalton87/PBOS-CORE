import { PbosApiRequest, PbosApiResponse } from "./contracts";
import { PbosConnectorTransport } from "./pbos-connector-client";

export type PbosFetch = (
    input: string,
    init: { readonly method: "POST"; readonly headers: Readonly<Record<string, string>>; readonly body: string }
) => Promise<{ readonly ok: boolean; json(): Promise<unknown> }>;

export class PbosHttpTransport implements PbosConnectorTransport {
    constructor(private readonly endpoint: string, private readonly fetcher: PbosFetch) {
        if (!endpoint) throw new Error("PBOS API endpoint is required.");
    }

    async send<TOutput>(request: PbosApiRequest): Promise<PbosApiResponse<TOutput>> {
        const response = await this.fetcher(this.endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "x-pbos-api-version": request.apiVersion },
            body: JSON.stringify(request)
        });
        const output = await response.json() as PbosApiResponse<TOutput>;
        if (!response.ok && output.success) throw new Error("PBOS transport returned an inconsistent success response.");
        return output;
    }
}
