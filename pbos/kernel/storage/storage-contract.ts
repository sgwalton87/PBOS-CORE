import { KernelState } from "../runtime/kernel-state";

export interface KernelStorageContract {
    save(systemId: string, state: KernelState): Promise<void>;
    load(systemId: string): Promise<KernelState | undefined>;
}
