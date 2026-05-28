"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const taskIndex_1 = require("../src/taskIndex");
const tasks = [
    { id: "done-1", didaId: "done-1" },
    { id: "task-a", didaId: "task-a" },
    { id: "task-b", didaId: "task-b" }
];
const visibleTasks = tasks.filter((task) => task.id !== "done-1");
const visibleTask = visibleTasks[0];
strict_1.default.equal((0, taskIndex_1.resolveTaskIndex)(tasks, visibleTask, 0), 1, "visible list index must not be reused as the settings.tasks index");
strict_1.default.equal((0, taskIndex_1.resolveTaskIndex)(tasks, { id: "local-only", didaId: null }, 5), -1, "nonexistent tasks should not resolve to an arbitrary fallback index");
console.log("taskIndex regression test passed");
