export interface TaskIndexIdentity {
    id?: string;
    didaId?: string | null;
}

export function resolveTaskIndex(tasks: TaskIndexIdentity[], task: TaskIndexIdentity, visibleIndex?: number): number {
    const matchedIndex = tasks.findIndex((current) =>
        (!!task.id && current.id === task.id) || (!!task.didaId && current.didaId === task.didaId)
    );
    if (matchedIndex !== -1) {
        return matchedIndex;
    }

    if (typeof visibleIndex === "number" && visibleIndex >= 0 && visibleIndex < tasks.length) {
        return visibleIndex;
    }

    return -1;
}
