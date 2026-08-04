import { KernelWorkflow, KernelWorkflowState } from "./workflow-contract";

const TRANSITIONS: Readonly<Record<KernelWorkflowState, readonly KernelWorkflowState[]>> = {
    CREATED: ["READY", "FAILED"],
    READY: ["ACTIVE", "FAILED"],
    ACTIVE: ["SUSPENDED", "COMPLETED", "FAILED"],
    SUSPENDED: ["ACTIVE", "FAILED"],
    COMPLETED: [],
    FAILED: []
};

export class WorkflowStateMachine {
    private readonly workflows = new Map<string, KernelWorkflow>();

    register(workflow: KernelWorkflow): void {
        if (this.workflows.has(workflow.workflowId)) {
            throw new Error(`Workflow already registered: ${workflow.workflowId}`);
        }
        this.workflows.set(workflow.workflowId, workflow);
    }

    transition(workflowId: string, state: KernelWorkflowState): KernelWorkflow {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
        if (!TRANSITIONS[workflow.state].includes(state)) {
            throw new Error(`Invalid workflow transition: ${workflow.state} -> ${state}`);
        }
        const next = { ...workflow, state, updatedAt: new Date() };
        this.workflows.set(workflowId, next);
        return next;
    }

    get(workflowId: string): KernelWorkflow | undefined {
        return this.workflows.get(workflowId);
    }

    all(systemId: string): readonly KernelWorkflow[] {
        return [...this.workflows.values()].filter(workflow => workflow.systemId === systemId);
    }
}
