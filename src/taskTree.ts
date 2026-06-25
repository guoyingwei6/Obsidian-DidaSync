import { formatTaskLineFromTask } from "./taskLineFormat";
import { DidaTask } from "./types";

export interface DidaTaskTreeNode {
    task: DidaTask;
    children: DidaTaskTreeNode[];
    depth: number;
}

export interface DidaTaskTreeIndex {
    roots: DidaTask[];
    childrenByParentId: Map<string, DidaTask[]>;
}

export interface DidaTaskFilterSets {
    matchedTaskKeys: Set<string>;
    renderableTaskKeys: Set<string>;
}

export function getDidaTaskTreeKey(task: DidaTask | null | undefined): string | null {
    if (!task) return null;
    return task.didaId || task.id || null;
}

export function getDidaTaskTreeKeys(task: DidaTask | null | undefined): string[] {
    if (!task) return [];
    const keys = [task.didaId, task.id].filter((key): key is string => !!key);
    return Array.from(new Set(keys));
}

export function sortDidaTasksForTree(tasks: DidaTask[]): DidaTask[] {
    return tasks.slice().sort((a, b) => {
        const orderA = typeof a.sortOrder === "number" ? a.sortOrder : Number.MAX_SAFE_INTEGER;
        const orderB = typeof b.sortOrder === "number" ? b.sortOrder : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;

        const dateA = a.startDate || a.dueDate;
        const dateB = b.startDate || b.dueDate;
        if (dateA && dateB) {
            const diff = new Date(dateA).getTime() - new Date(dateB).getTime();
            if (diff !== 0 && !Number.isNaN(diff)) return diff;
        } else if (dateA) {
            return -1;
        } else if (dateB) {
            return 1;
        }

        return (a.title || "").localeCompare(b.title || "");
    });
}

export function buildDidaTaskTreeIndex(tasks: DidaTask[]): DidaTaskTreeIndex {
    const taskKeys = new Set<string>();
    const taskAliasesByKey = new Map<string, string[]>();
    const childrenByParentId = new Map<string, DidaTask[]>();
    const roots: DidaTask[] = [];
    const aliasesByMatchedParentId = new Map<string, string[]>();

    for (const task of tasks) {
        const keys = getDidaTaskTreeKeys(task);
        for (const key of keys) {
            taskKeys.add(key);
            taskAliasesByKey.set(key, keys);
        }
    }

    for (const task of tasks) {
        const parentId = task.parentId || null;
        if (parentId && taskKeys.has(parentId)) {
            const children = childrenByParentId.get(parentId) || [];
            children.push(task);
            childrenByParentId.set(parentId, children);
            const aliases = taskAliasesByKey.get(parentId);
            if (aliases) aliasesByMatchedParentId.set(parentId, aliases);
        } else {
            roots.push(task);
        }
    }

    for (const [matchedParentId, aliases] of aliasesByMatchedParentId.entries()) {
        const children = childrenByParentId.get(matchedParentId);
        if (!children) continue;
        for (const alias of aliases) {
            const existing = childrenByParentId.get(alias) || [];
            const merged = existing.slice();
            for (const child of children) {
                if (!merged.includes(child)) merged.push(child);
            }
            childrenByParentId.set(alias, merged);
        }
    }

    for (const [parentId, children] of childrenByParentId.entries()) {
        childrenByParentId.set(parentId, sortDidaTasksForTree(children));
    }

    return {
        roots: sortDidaTasksForTree(roots),
        childrenByParentId
    };
}

export function buildDidaTaskTreeNodes(tasks: DidaTask[], maxDepth: number = 20): DidaTaskTreeNode[] {
    const index = buildDidaTaskTreeIndex(tasks);
    return index.roots.map((task) => buildDidaTaskTreeNode(task, index.childrenByParentId, 0, new Set(), maxDepth));
}

export function buildDidaTaskTreeNode(
    task: DidaTask,
    childrenByParentId: Map<string, DidaTask[]>,
    depth: number = 0,
    ancestors: Set<string> = new Set(),
    maxDepth: number = 20
): DidaTaskTreeNode {
    const key = getDidaTaskTreeKey(task);
    const nextAncestors = new Set(ancestors);
    if (key) nextAncestors.add(key);

    const children: DidaTaskTreeNode[] = [];
    if (key && depth < maxDepth) {
        for (const child of childrenByParentId.get(key) || []) {
            const childKey = getDidaTaskTreeKey(child);
            if (childKey && nextAncestors.has(childKey)) continue;
            children.push(buildDidaTaskTreeNode(child, childrenByParentId, depth + 1, nextAncestors, maxDepth));
        }
    }

    return { task, children, depth };
}

export function flattenDidaTaskTree(node: DidaTaskTreeNode): DidaTaskTreeNode[] {
    const out: DidaTaskTreeNode[] = [node];
    for (const child of node.children) out.push(...flattenDidaTaskTree(child));
    return out;
}

export function buildDidaTaskDragPayload(task: DidaTask, allTasks: DidaTask[], baseIndent: string = ""): string {
    if (!task || !task.didaId) return "";
    const index = buildDidaTaskTreeIndex(allTasks || []);
    const node = buildDidaTaskTreeNode(task, index.childrenByParentId);
    const lines = flattenDidaTaskTree(node)
        .map((item) => formatTaskLineFromTask(item.task, baseIndent + "\t".repeat(item.depth)))
        .filter(Boolean);
    return lines.join("\n");
}

export function getDidaTaskPath(task: DidaTask, allTasks: DidaTask[]): string {
    const byKey = new Map<string, DidaTask>();
    for (const candidate of allTasks || []) {
        for (const key of getDidaTaskTreeKeys(candidate)) byKey.set(key, candidate);
    }

    const path: string[] = [];
    const seen = new Set<string>();
    let current: DidaTask | undefined = task;
    while (current) {
        const key = getDidaTaskTreeKey(current);
        if (key) {
            if (seen.has(key)) break;
            seen.add(key);
        }
        path.unshift(current.title || "无标题任务");
        current = current.parentId ? byKey.get(current.parentId) : undefined;
    }
    return path.join(" / ");
}

export function buildDidaTaskFilterSets(
    tasks: DidaTask[],
    matchedTasks: DidaTask[],
    canIncludeTask?: (task: DidaTask) => boolean
): DidaTaskFilterSets {
    const matchedTaskKeys = new Set<string>();
    const renderableTaskKeys = new Set<string>();
    const byKey = new Map<string, DidaTask>();

    for (const task of tasks || []) {
        for (const key of getDidaTaskTreeKeys(task)) byKey.set(key, task);
    }

    for (const task of matchedTasks || []) {
        const key = getDidaTaskTreeKey(task);
        if (!key) continue;
        matchedTaskKeys.add(key);

        let current: DidaTask | undefined = task;
        const seen = new Set<string>();
        while (current) {
            const currentKey = getDidaTaskTreeKey(current);
            if (!currentKey || seen.has(currentKey)) break;
            seen.add(currentKey);

            if (canIncludeTask && !canIncludeTask(current)) break;
            renderableTaskKeys.add(currentKey);

            if (!current.parentId) break;
            current = byKey.get(current.parentId);
        }
    }

    return { matchedTaskKeys, renderableTaskKeys };
}
