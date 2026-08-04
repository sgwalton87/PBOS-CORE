export type ObservationSignalType = "PERFORMANCE" | "USAGE" | "HEALTH" | "FEEDBACK";

export interface SystemObservation {
    readonly observationId: string;
    readonly systemId: string;
    readonly signalType: ObservationSignalType;
    readonly metric: string;
    readonly value: number;
    readonly expectedRange?: { readonly minimum: number; readonly maximum: number };
    readonly provenance: readonly string[];
    readonly observedAt: Date;
}
