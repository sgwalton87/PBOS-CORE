/*
===============================================================================

PBOS Progress Renderer

Authority

PBOS-CLI-009

Classification

Constitutional UI

===============================================================================
*/

export class Progress {

    render(
        stage: string,
        current: number,
        total: number
    ): void {

        const percentage = Math.round(
            (current / total) * 100
        );

        console.log(
            `[${current}/${total}] ${percentage}%  ${stage}`
        );

    }

}
