import assert from "node:assert/strict";
import Module from "node:module";

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === "obsidian") {
        return { Notice: class Notice { constructor(_message?: string) { } } };
    }
    if (request === "../main" || request.endsWith("/main")) {
        return class DidaSyncPlugin { };
    }
    return originalLoad.call(this, request, parent, isMain);
};

function payload(result: any) {
    return JSON.parse(result.content[0].text);
}

async function run() {
    const { McpServerManager } = require("../src/managers/McpServerManager");
    const calls: string[] = [];
    const tasks = [
        { id: "1", didaId: "r1", title: "Alpha today", content: "note", desc: "", status: 0, projectId: "inbox", projectName: "收集箱", dueDate: "2026-06-24T10:00:00+0800", isAllDay: false, priority: 5, updatedAt: "2026-06-20T00:00:00+0800" },
        { id: "2", didaId: "r2", title: "Beta unscheduled", content: "", desc: "searchable", status: 0, projectId: "p1", projectName: "项目甲", priority: 1, updatedAt: "2026-06-21T00:00:00+0800" },
        { id: "3", didaId: "r3", title: "Done", content: "", desc: "", status: 2, projectId: "p1", projectName: "项目甲", completedTime: "2026-06-22T00:00:00+0800" }
    ];
    const plugin = {
        settings: {
            mcpReadOnly: false,
            tasks,
            projects: [],
            completedTasks: [{ ...tasks[2] }],
            projectCatalog: [{ id: "inbox", name: "收集箱", isArchived: false, isLocalOnly: false }, { id: "p1", name: "项目甲", isArchived: false, isLocalOnly: false }],
            accessToken: "",
            mcpToken: "secret"
        },
        getProjectCatalog() { return this.settings.projectCatalog; },
        isInboxProject(id: string, name: string) { return id === "inbox" || name === "收集箱"; },
        async addTask(title: string, projectName: string, projectId: string) {
            const task = { id: `local-${title}`, didaId: undefined, title, content: "", desc: "", status: 0, projectId, projectName, priority: 0 };
            this.settings.tasks.push(task);
            return task;
        },
        async saveSettings() { calls.push("save"); },
        refreshTaskView() { calls.push("refresh"); },
        async updateTaskInDidaList() { calls.push("remote-update"); },
        async toggleTask(index: number) { this.settings.tasks[index].status = 2; calls.push("toggle"); },
        async deleteTask(index: number) { this.settings.tasks.splice(index, 1); calls.push("delete"); },
        async moveTaskToProject(task: any, toProjectId: string) { task.projectId = toProjectId; task.projectName = "项目甲"; calls.push("move"); },
        async fetchCompletedTasks() { calls.push("fetch-completed"); },
        async manualSync() { calls.push("sync"); },
        getUserTimeZone() { return "Asia/Shanghai"; },
        getUserTimeZoneDateTimeExample() { return "2026-06-19T11:00:00+08:00"; }
    };
    const manager = new McpServerManager(plugin as any);

    const tools = (manager as any).getTools();
    assert.equal(tools.length, 12);
    assert.ok(tools.find((tool: any) => tool.name === "dida_list_tasks")?.readOnly);

    let list = payload(await (manager as any).callTool("dida_list_tasks", { query: "alpha", priority: 5, sortBy: "title" }));
    assert.equal(list.ok, true);
    assert.deepEqual(list.data.map((task: any) => task.title), ["Alpha today"]);

    let unscheduled = payload(await (manager as any).callTool("dida_list_tasks", { datePreset: "unscheduled" }));
    assert.deepEqual(unscheduled.data.map((task: any) => task.title), ["Beta unscheduled"]);

    let created = payload(await (manager as any).callTool("dida_create_task", { title: "New", projectId: "p1", projectName: "项目甲", requestId: "req-1", sync: false }));
    let duplicate = payload(await (manager as any).callTool("dida_create_task", { title: "New again", requestId: "req-1", sync: false }));
    assert.equal(created.data.id, duplicate.data.id);

    let update = payload(await (manager as any).callTool("dida_update_task", { id: "2", title: "Beta updated", priority: 3, sync: false }));
    assert.equal(update.data.title, "Beta updated");
    assert.equal(update.data.priority, 3);

    let schedule = payload(await (manager as any).callTool("dida_schedule_tasks", { items: [{ id: "2", dueDate: "2026-06-25", isAllDay: true }], sync: false }));
    assert.equal(schedule.data.updated.length, 1);
    assert.equal(schedule.data.errors.length, 0);

    let complete = payload(await (manager as any).callTool("dida_complete_task", { id: "2" }));
    assert.equal(complete.data.status, 2);
    assert.ok(calls.includes("toggle"));

    let completed = payload(await (manager as any).callTool("dida_list_completed_tasks", { query: "done", refresh: false }));
    assert.deepEqual(completed.data.map((task: any) => task.title), ["Done"]);

    plugin.settings.mcpReadOnly = true;
    let readOnlyWrite = payload(await (manager as any).callTool("dida_delete_task", { id: "1" }));
    assert.equal(readOnlyWrite.ok, false);
    assert.equal(readOnlyWrite.error.code, "READ_ONLY");
    let readOnlyRead = payload(await (manager as any).callTool("dida_search_tasks", { query: "alpha" }));
    assert.equal(readOnlyRead.ok, true);

    const unauthorized = (manager as any).isAuthorized({ headers: {}, url: "/mcp" });
    const authorized = (manager as any).isAuthorized({ headers: { authorization: "Bearer secret" }, url: "/mcp" });
    assert.equal(unauthorized, false);
    assert.equal(authorized, true);

    console.log("MCP tool behavior tests passed");
}

run()
    .finally(() => {
        (Module as any)._load = originalLoad;
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
