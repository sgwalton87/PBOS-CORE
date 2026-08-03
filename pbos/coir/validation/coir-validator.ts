import { CanonicalOrganization }

from "../model/coir-model";

export class CoirValidator {

    validate(

        organization: CanonicalOrganization

    ): boolean {

        return (

            organization.id.length > 0 &&

            organization.legalName.length > 0

        );

    }

}
