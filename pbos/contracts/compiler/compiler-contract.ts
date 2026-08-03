import { ConstitutionalContract }
from "../core/constitutional-contract";

export interface CompilerContract
extends ConstitutionalContract {

    compile(): Promise<void>;

}
