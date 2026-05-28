export interface TaskIndexIdentity {
    id?: string;
    didaId?: string | null;
}

export function resolveTaskIndex(tasks: TaskIndexIdentity[], task: TaskIndexIdentity, visibleIndex?: number): number {
    const matchedIndex = tasks.findIndex((current) => task.didaId ? current.didaId === task.didaId : current.id === task.id);
    if (matchedIndex !== -1) {
        return matchedIndex;
    }

    if (typeof visibleIndex === "number" && visibleIndex >= 0 && visibleIndex < tasks.length) {
        return visibleIndex;
    }

    return -1;
}
