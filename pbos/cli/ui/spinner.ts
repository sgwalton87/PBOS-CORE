/*
===============================================================================

PBOS Spinner

Authority

PBOS-CLI-010

===============================================================================
*/

export class Spinner {

    private active = false;

    start(message: string): void {

        this.active = true;

        console.log(`⏳ ${message}`);

    }

    stop(message?: string): void {

        if (!this.active) {

            return;

        }

        this.active = false;

        console.log(
            message ?? "✓ Complete"
        );

    }

}
