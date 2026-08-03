/*
===============================================================================

PBOS Discovery Modes

===============================================================================
*/

export type DiscoveryMode =

    | "GREENFIELD"

    | "CONSTITUTIONAL_CORPUS"

    | "EXISTING_PLATFORM"

    | "HYBRID";

export const DiscoveryModeDescriptions = {

    GREENFIELD:
        "Acquire understanding through guided constitutional interviews.",

    CONSTITUTIONAL_CORPUS:
        "Acquire understanding from organizational documentation.",

    EXISTING_PLATFORM:
        "Acquire understanding from repositories and existing software.",

    HYBRID:
        "Acquire understanding from every governed source."

} as const;
