import { z } from "zod";
import { ConnectorManifest } from "./contracts";

export const connectorManifestSchema = z.strictObject({ connectorId: z.string().min(1), externalSystemId: z.string().min(1),
    pbosSystemId: z.string().min(1), name: z.string().min(1), version: z.string().regex(/^\d+\.\d+\.\d+$/),
    domainIds: z.array(z.string().min(1)).min(1), permissions: z.array(z.string().min(1)),
    communicationRules: z.array(z.string().min(1)) });
export const parseConnectorManifest = (value: unknown): ConnectorManifest => connectorManifestSchema.parse(value);
