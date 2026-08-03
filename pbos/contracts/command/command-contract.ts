import { ConstitutionalContract }
from "../core/constitutional-contract";

export interface CommandContract
extends ConstitutionalContract {

    execute(
        ...args: readonly unknown[]
    ): Promise<unknown>;

}
