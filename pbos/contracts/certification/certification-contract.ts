import { ConstitutionalContract }
from "../core/constitutional-contract";

export interface CertificationContract
extends ConstitutionalContract {

    certify(): Promise<boolean>;

}
