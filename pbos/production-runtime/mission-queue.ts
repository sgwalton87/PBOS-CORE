import { MissionQueueItem } from "./contracts";

export class GovernedMissionQueue {
    reconcile(items: readonly MissionQueueItem[]): readonly MissionQueueItem[] {
        const ids = new Set(items.map(item => item.missionId));
        if (ids.size !== items.length) throw new Error("Mission queue contains duplicate mission identifiers.");
        items.forEach(item => item.dependencies.forEach(dependency => {
            if (!ids.has(dependency)) throw new Error(`Mission ${item.missionId} has unknown dependency ${dependency}.`);
        }));
        this.assertAcyclic(items);
        const complete = new Set(items.filter(item => item.status === "COMPLETE").map(item => item.missionId));
        return items.map(item => {
            if (["COMPLETE", "ACTIVE"].includes(item.status)) return item;
            const blockers = item.dependencies.filter(dependency => !complete.has(dependency));
            return { ...item, status: blockers.length ? "BLOCKED" : "ELIGIBLE",
                rationale: blockers.length ? `Waiting for: ${blockers.join(", ")}` : "All declared dependencies are complete." };
        });
    }

    next(items: readonly MissionQueueItem[]): MissionQueueItem | undefined {
        return this.reconcile(items).find(item => item.status === "ELIGIBLE");
    }

    private assertAcyclic(items: readonly MissionQueueItem[]): void {
        const byId = new Map(items.map(item => [item.missionId, item]));
        const visiting = new Set<string>(); const visited = new Set<string>();
        const visit = (id: string): void => {
            if (visiting.has(id)) throw new Error(`Mission dependency cycle detected at ${id}.`);
            if (visited.has(id)) return;
            visiting.add(id);
            byId.get(id)?.dependencies.forEach(visit);
            visiting.delete(id); visited.add(id);
        };
        items.forEach(item => visit(item.missionId));
    }
}
