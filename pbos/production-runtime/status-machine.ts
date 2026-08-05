import { ProductionStatus, TERMINAL_PRODUCTION_STATUSES } from "./contracts";

const transitions: Readonly<Record<ProductionStatus, readonly ProductionStatus[]>> = {
    IDLE: ["PLANNING", "AUTHORIZED", "RECOVERING"],
    PLANNING: ["AUTHORIZED", "BLOCKED", "FAILED", "CANCELLED"],
    AUTHORIZED: ["QUEUED", "BLOCKED", "CANCELLED"],
    QUEUED: ["STARTING", "PAUSED", "CANCELLED"],
    STARTING: ["RUNNING", "BLOCKED", "FAILED", "CANCELLED"],
    RUNNING: ["VALIDATING", "GENERATING_PREVIEW", "PAUSED", "BLOCKED", "FAILED", "CANCELLED"],
    VALIDATING: ["REPAIRING", "GENERATING_PREVIEW", "AWAITING_APPROVAL", "COMPLETED", "BLOCKED", "FAILED", "CANCELLED"],
    REPAIRING: ["RUNNING", "VALIDATING", "BLOCKED", "FAILED", "CANCELLED"],
    GENERATING_PREVIEW: ["VALIDATING", "AWAITING_APPROVAL", "COMPLETED", "BLOCKED", "FAILED", "CANCELLED"],
    AWAITING_APPROVAL: ["CERTIFIED", "PAUSED", "BLOCKED", "CANCELLED"],
    PAUSED: ["RUNNING", "VALIDATING", "RECOVERING", "CANCELLED"],
    BLOCKED: ["RECOVERING", "CANCELLED"],
    FAILED: ["RECOVERING", "CANCELLED"],
    COMPLETED: ["CERTIFIED"],
    CERTIFIED: [],
    CANCELLED: [],
    RECOVERING: ["RUNNING", "VALIDATING", "BLOCKED", "FAILED", "CANCELLED"]
};

export function assertProductionTransition(from: ProductionStatus, to: ProductionStatus): void {
    if (from === to) return;
    if (!transitions[from].includes(to)) throw new Error(`Invalid PBOS production transition: ${from} -> ${to}`);
}

export function isTerminalProductionStatus(status: ProductionStatus): boolean {
    return TERMINAL_PRODUCTION_STATUSES.includes(status);
}
