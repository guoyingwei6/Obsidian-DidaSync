import assert from "node:assert/strict";
import { resolveTaskIndex } from "../src/taskIndex";

const tasks = [
    { id: "done-1", didaId: "done-1" },
    { id: "task-a", didaId: "task-a" },
    { id: "task-b", didaId: "task-b" }
];

const visibleTasks = tasks.filter((task) => task.id !== "done-1");
const visibleTask = visibleTasks[0];

assert.equal(
    resolveTaskIndex(tasks, visibleTask, 0),
    1,
    "visible list index must not be reused as the settings.tasks index"
);

assert.equal(
    resolveTaskIndex(tasks, { id: "local-only", didaId: null }, 5),
    -1,
    "nonexistent tasks should not resolve to an arbitrary fallback index"
);

console.log("taskIndex regression test passed");
