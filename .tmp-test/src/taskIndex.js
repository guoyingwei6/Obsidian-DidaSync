"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTaskIndex = void 0;
function resolveTaskIndex(tasks, task, visibleIndex) {
    const matchedIndex = tasks.findIndex((current) => task.didaId ? current.didaId === task.didaId : current.id === task.id);
    if (matchedIndex !== -1) {
        return matchedIndex;
    }
    if (typeof visibleIndex === "number" && visibleIndex >= 0 && visibleIndex < tasks.length) {
        return visibleIndex;
    }
    return -1;
}
exports.resolveTaskIndex = resolveTaskIndex;
