/*
===============================================================================

PBOS Artifact Runtime

Authority

PBOS-ARTIFACT-002

===============================================================================
*/

export enum ArtifactRuntimeState {

    CREATED = "CREATED",

    VALIDATED = "VALIDATED",

    REGISTERED = "REGISTERED",

    CERTIFIED = "CERTIFIED"

}

export class ArtifactRuntime {

    private state = ArtifactRuntimeState.CREATED;

    getState(): ArtifactRuntimeState {

        return this.state;

    }

    validate(): void {

        this.state = ArtifactRuntimeState.VALIDATED;

    }

    register(): void {

        this.state = ArtifactRuntimeState.REGISTERED;

    }

    certify(): void {

        this.state = ArtifactRuntimeState.CERTIFIED;

    }

}
