/*
===============================================================================

PBOS CLI Command Result

Authority

PBOS-CLI-003

===============================================================================
*/

export interface CommandResult {

    readonly success: boolean;

    readonly exitCode: number;

    readonly message?: string;

    readonly artifacts?: readonly string[];

    readonly warnings?: readonly string[];

}
