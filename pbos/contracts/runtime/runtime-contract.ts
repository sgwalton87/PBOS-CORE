import { ConstitutionalContract }
from "../core/constitutional-contract";

export interface RuntimeContract
extends ConstitutionalContract {

    initialize(): Promise<void>;

    shutdown(): Promise<void>;

}
