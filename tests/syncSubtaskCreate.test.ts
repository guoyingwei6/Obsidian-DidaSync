import { strict as assert } from "assert";
import Module = require("module");

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === "obsidian") {
        return {
            Notice: class Notice { constructor(_message: string) { } }
        };
    }
    if (request.endsWith("/main") || request === "../main") {
        return class DidaSyncPlugin { };
    }
    if (request.endsWith("/views/TaskView") || request === "../views/TaskView") {
        return { TASK_VIEW_TYPE: "dida-task-view", TaskView: class TaskView { } };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const { SyncManager } = require("../src/managers/SyncManager");

async function run() {
    const calls: any[] = [];
    const task: any = {
        id: "local-child",
        title: "子任务",
        content: "",
        desc: "",
        status: 0,
        projectId: "p1",
        projectName: "项目",
        parentId: "parent-remote",
        items: []
    };

    const plugin: any = {
        settings: { tasks: [task] },
        getUserTimeZone() { return "Asia/Shanghai"; },
        saveSettingsCalls: 0,
        async saveSettings() { this.saveSettingsCalls++; },
        apiClient: {
            async makeAuthenticatedRequest(_url: string, options: any) {
                calls.push(JSON.parse(options.body));
                return {
                    ok: true,
                    async json() {
                        return {
                            id: "child-remote",
                            status: 0,
                            kind: "TEXT",
                            projectViewMode: "list",
                            projectKind: "TASK"
                        };
                    },
                    async text() { return ""; }
                };
            }
        }
    };

    const manager = new SyncManager(plugin);
    await manager.createTaskInDidaList(task);

    assert.equal(calls[0].parentId, "parent-remote");
    assert.equal(task.didaId, "child-remote");
    assert.equal(task.parentId, "parent-remote");
    assert.ok(plugin.saveSettingsCalls >= 1);

    const completedSubtask: any = {
        id: "local-child-completed",
        title: "已完成子任务",
        content: "",
        desc: "",
        status: 2,
        projectId: "p1",
        projectName: "项目",
        parentId: "parent-remote",
        items: []
    };
    plugin.settings.tasks.push(completedSubtask);
    plugin.apiClient.makeAuthenticatedRequest = async (_url: string, options: any) => {
        calls.push(JSON.parse(options.body));
        return {
            ok: true,
            async json() {
                return {
                    id: "child-completed-remote",
                    status: 2,
                    completedTime: "2026-06-26T12:00:00+0800",
                    kind: "TEXT",
                    projectViewMode: "list",
                    projectKind: "TASK",
                    parentId: "parent-remote"
                };
            },
            async text() { return ""; }
        };
    };

    await manager.createTaskInDidaList(completedSubtask);
    assert.equal(calls.at(-1).parentId, "parent-remote");
    assert.equal(completedSubtask.didaId, "child-completed-remote");
    assert.equal(completedSubtask.completedTime, "2026-06-26T12:00:00+0800");

    const updateSubtask: any = {
        id: "local-child-update",
        didaId: "child-update-remote",
        title: "更新完成子任务",
        content: "",
        desc: "",
        status: 2,
        projectId: "p1",
        projectName: "项目",
        parentId: "parent-remote",
        items: []
    };
    plugin.settings.tasks.push(updateSubtask);
    plugin.apiClient.makeAuthenticatedRequest = async (_url: string, options: any) => {
        calls.push(JSON.parse(options.body));
        return {
            ok: true,
            async text() { return ""; },
            async json() { return {}; }
        };
    };
    await manager.updateTaskInDidaList(updateSubtask);
    assert.equal(calls.at(-1).parentId, "parent-remote");
    assert.equal(typeof calls.at(-1).completedTime, "string");
    assert.equal(updateSubtask.completedTime, calls.at(-1).completedTime);

    const reverseCompletedSubtask: any = {
        id: "local-child-reverse",
        didaId: "child-reverse-remote",
        title: "反向完成子任务",
        content: "",
        desc: "",
        status: 0,
        projectId: "p1",
        projectName: "项目",
        parentId: "parent-remote",
        items: []
    };
    plugin.settings.tasks.push(reverseCompletedSubtask);
    (manager as any)._decideReverseCompletion = async () => true;
    await manager.markExtraTasksAsCompleted([
        { id: "child-remote" },
        { id: "child-completed-remote" },
        { id: "child-update-remote" }
    ]);
    assert.equal(reverseCompletedSubtask.status, 2);
    assert.equal(typeof reverseCompletedSubtask.completedTime, "string");
}

run().then(() => {
    console.log("sync subtask create tests passed");
});
