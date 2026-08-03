import { ConstitutionalContract }
from "../core/constitutional-contract";

export interface AdapterContract
extends ConstitutionalContract {

    connect(): Promise<void>;

    disconnect(): Promise<void>;

}
