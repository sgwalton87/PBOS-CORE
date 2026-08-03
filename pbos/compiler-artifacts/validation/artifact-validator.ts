import { CompilerArtifact }

from "../contracts/compiler-artifact";

export class ArtifactValidator {

    validate(

        artifact: CompilerArtifact

    ): boolean {

        return (

            artifact.id.length > 0 &&

            artifact.artifactType.length > 0 &&

            artifact.schemaVersion.length > 0 &&

            artifact.compilerVersion.length > 0 &&

            artifact.lineageId.length > 0

        );

    }

}
