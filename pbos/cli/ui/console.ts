/*
===============================================================================

PBOS Console

Authority

PBOS-CLI-011

===============================================================================
*/

export class PBOSConsole {

    info(
        message: string
    ): void {

        console.log(message);

    }

    success(
        message: string
    ): void {

        console.log(`✓ ${message}`);

    }

    warning(
        message: string
    ): void {

        console.warn(`⚠ ${message}`);

    }

    error(
        message: string
    ): void {

        console.error(`✖ ${message}`);

    }

}
