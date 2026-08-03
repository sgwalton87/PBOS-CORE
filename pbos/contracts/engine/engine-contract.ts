import { ConstitutionalContract }
from "../core/constitutional-contract";

export interface EngineContract
extends ConstitutionalContract {

    initialize(): Promise<void>;

    validate(): Promise<void>;

    execute(): Promise<void>;

    report(): Promise<void>;

    certify(): Promise<void>;

}
