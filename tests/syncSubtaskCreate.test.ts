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
            async makeAuthenticatedRequest(url: string, options: any = {}) {
                calls.push({ url, payload: options.body ? JSON.parse(options.body) : null });
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

    assert.equal(calls[0].payload.parentId, "parent-remote");
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
    plugin.apiClient.makeAuthenticatedRequest = async (url: string, options: any = {}) => {
        calls.push({ url, payload: options.body ? JSON.parse(options.body) : null });
        if (url.includes("/complete")) {
            return {
                ok: true,
                status: 200,
                async json() { return {}; },
                async text() { return ""; }
            };
        }
        return {
            ok: true,
            async json() {
                return {
                    id: "child-completed-remote",
                    status: 0,
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
    assert.equal(calls.at(-2).payload.parentId, "parent-remote");
    assert.match(calls.at(-1).url, /\/complete$/);
    assert.equal(completedSubtask.didaId, "child-completed-remote");
    assert.equal(typeof completedSubtask.completedTime, "string");

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
    plugin.apiClient.makeAuthenticatedRequest = async (url: string, options: any = {}) => {
        calls.push({ url, payload: options.body ? JSON.parse(options.body) : null });
        return {
            ok: true,
            status: 200,
            async text() { return ""; },
            async json() { return {}; }
        };
    };
    await manager.updateTaskInDidaList(updateSubtask);
    assert.equal(calls.at(-2).payload.parentId, "parent-remote");
    assert.equal(calls.at(-2).payload.completedTime, undefined);
    assert.match(calls.at(-1).url, /\/complete$/);
    assert.equal(typeof updateSubtask.completedTime, "string");

    const clearParentSubtask: any = {
        id: "local-child-clear-parent",
        didaId: "child-clear-parent-remote",
        title: "解除父任务",
        content: "",
        desc: "",
        status: 0,
        projectId: "p1",
        projectName: "项目",
        parentId: null,
        items: []
    };
    plugin.settings.tasks.push(clearParentSubtask);
    plugin.apiClient.makeAuthenticatedRequest = async (url: string, options: any = {}) => {
        calls.push({ url, payload: options.body ? JSON.parse(options.body) : null });
        return {
            ok: true,
            status: 200,
            async text() { return ""; },
            async json() { return {}; }
        };
    };
    await manager.updateTaskInDidaList(clearParentSubtask);
    assert.equal(calls.at(-1).payload.parentId, "");
    assert.equal(clearParentSubtask.parentId, null);

    const localParent: any = {
        id: "local-parent",
        title: "本地父任务",
        content: "",
        desc: "",
        status: 0,
        projectId: "p1",
        projectName: "项目",
        items: []
    };
    const childWithLocalParent: any = {
        id: "local-child-with-local-parent",
        title: "本地父子任务",
        content: "",
        desc: "",
        status: 0,
        projectId: "p1",
        projectName: "项目",
        parentId: "local-parent",
        items: []
    };
    plugin.settings.tasks.push(localParent, childWithLocalParent);
    const localParentCalls: any[] = [];
    plugin.apiClient.makeAuthenticatedRequest = async (url: string, options: any = {}) => {
        const payload = options.body ? JSON.parse(options.body) : null;
        localParentCalls.push({ url, payload });
        return {
            ok: true,
            status: 200,
            async text() { return ""; },
            async json() {
                return {
                    id: payload?.title === "本地父任务" ? "local-parent-remote" : "local-child-with-parent-remote",
                    status: 0,
                    kind: "TEXT",
                    projectViewMode: "list",
                    projectKind: "TASK",
                    parentId: payload?.parentId
                };
            }
        };
    };
    await manager.createTaskInDidaList(childWithLocalParent);
    assert.equal(localParentCalls[0].payload.parentId, undefined);
    assert.equal(localParentCalls[1].payload.parentId, "local-parent-remote");
    assert.equal(localParent.didaId, "local-parent-remote");
    assert.equal(childWithLocalParent.parentId, "local-parent-remote");

    const inboxProbeCalls: any[] = [];
    const inboxProbePlugin: any = {
        settings: {
            tasks: [],
            remoteInboxProjectId: "",
            pendingSyncOperations: []
        },
        async saveSettings() { },
        refreshTaskView() { },
        apiClient: {
            async makeAuthenticatedRequest(url: string, options: any = {}) {
                const payload = options.body ? JSON.parse(options.body) : null;
                inboxProbeCalls.push({ url, method: options.method || "GET", payload });
                if (url.endsWith("/open/v1/task")) {
                    return {
                        ok: true,
                        status: 200,
                        async text() {
                            return JSON.stringify({ id: "probe-remote", projectId: "inbox1010590000" });
                        },
                        async json() {
                            return { id: "probe-remote", projectId: "inbox1010590000" };
                        }
                    };
                }
                return {
                    ok: true,
                    status: 200,
                    async text() { return ""; },
                    async json() { return {}; }
                };
            }
        }
    };
    const inboxProbeManager = new SyncManager(inboxProbePlugin);
    await inboxProbeManager.deleteTaskInDidaList("remote-inbox-task", "inbox", false);
    assert.equal(inboxProbePlugin.settings.remoteInboxProjectId, "inbox1010590000");
    assert.match(inboxProbeCalls[1].url, /\/project\/inbox1010590000\/task\/probe-remote$/);
    assert.match(inboxProbeCalls[2].url, /\/project\/inbox1010590000\/task\/remote-inbox-task$/);

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
