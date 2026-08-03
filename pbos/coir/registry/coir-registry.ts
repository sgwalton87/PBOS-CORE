import { CanonicalOrganization }

from "../model/coir-model";

export class CoirRegistry {

    private readonly registry =

        new Map<string, CanonicalOrganization>();

    register(

        model: CanonicalOrganization

    ): void {

        this.registry.set(

            model.id,

            model

        );

    }

    get(

        id: string

    ): CanonicalOrganization | undefined {

        return this.registry.get(id);

    }

}
