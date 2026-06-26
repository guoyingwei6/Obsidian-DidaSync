import { strict as assert } from "assert";
import Module = require("module");

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === "obsidian") {
        return {
            ItemView: class ItemView { },
            Modal: class Modal { },
            Notice: class Notice { constructor(_message: string) { } },
            Platform: { isMobile: false },
            Plugin: class Plugin { },
            PluginSettingTab: class PluginSettingTab { },
            Setting: class Setting { },
            TFile: class TFile { },
            WorkspaceLeaf: class WorkspaceLeaf { },
            getIconIds: () => [],
            normalizePath: (path: string) => path,
            setIcon: () => { },
            requestUrl: async () => ({ status: 200, json: async () => ({}) })
        };
    }
    if (request === "electron") return {};
    return originalLoad.call(this, request, parent, isMain);
};

const DidaSyncPlugin = require("../src/main").default;
const { SyncManager } = require("../src/managers/SyncManager");

function makePlugin() {
    const plugin = new DidaSyncPlugin();
    const calls: string[] = [];
    const moveCalls: any[] = [];
    plugin.settings = {
        tasks: [],
        accessToken: "",
        remoteInboxProjectId: "inbox1010590000",
        projectCatalog: [
            { id: "p1", name: "项目一", isArchived: false, isLocalOnly: false },
            { id: "p2", name: "项目二", isArchived: false, isLocalOnly: false }
        ],
        projects: [],
        projectIcons: {},
        hiddenProjectKeys: [],
        pendingSyncOperations: []
    };
    plugin.saveSettings = async () => { calls.push("save"); };
    plugin.refreshTaskView = () => { calls.push("refresh"); };
    let currentTaskForSync: any = null;
    plugin.apiClient = {
        async moveTask(fromProjectId: string, toProjectId: string, taskId: string) {
            calls.push("move");
            moveCalls.push({ fromProjectId, toProjectId, taskId });
        },
        async makeAuthenticatedRequest() {
            calls.push("verify");
            return {
                ok: true,
                status: 200,
                async text() {
                    return JSON.stringify({
                        id: currentTaskForSync?.didaId,
                        projectId: currentTaskForSync?.projectId || "inbox",
                        parentId: currentTaskForSync?.parentId ?? null
                    });
                },
                async json() {
                    return {
                        id: currentTaskForSync?.didaId,
                        projectId: currentTaskForSync?.projectId || "inbox",
                        parentId: currentTaskForSync?.parentId ?? null
                    };
                }
            };
        }
    };
    plugin.syncManager = new SyncManager(plugin);
    plugin.syncManager.updateTaskInDidaList = async (task: any) => {
        calls.push("sync");
        await plugin.syncManager.clearOperation(task || currentTaskForSync);
    };
    plugin.syncManager.queueOperation = async function (task: any, type: string, payload: any) {
        currentTaskForSync = task;
        return SyncManager.prototype.queueOperation.call(this, task, type as any, payload);
    };
    return { plugin, calls, moveCalls };
}

async function run() {
    {
        const { plugin, calls } = makePlugin();
        const parent: any = { id: "local-parent", didaId: "remote-parent", title: "父任务", status: 0, projectId: "p2", projectName: "项目二" };
        const child: any = { id: "child", didaId: "remote-child", title: "子任务", status: 0, projectId: "p1", projectName: "项目一" };
        plugin.settings.tasks = [parent, child];
        await plugin.reparentTask(child, parent);
        assert.equal(child.parentId, "remote-parent");
        assert.equal(child.projectId, "p2");
        assert.equal(child.projectName, "项目二");
        assert.deepEqual(calls, ["save", "refresh", "save", "refresh"]);
        assert.equal(child.syncPlacementPending, false);
    }

    {
        const { plugin } = makePlugin();
        const parent: any = { id: "parent", didaId: "remote-parent", title: "父任务", status: 0, projectId: "p1", projectName: "项目一" };
        const child: any = { id: "child", didaId: "remote-child", title: "子任务", status: 0, projectId: "p1", projectName: "项目一", parentId: "remote-parent" };
        plugin.settings.tasks = [parent, child];
        await assert.rejects(() => plugin.reparentTask(parent, child), /不能将任务拖到自己的子任务上/);
        await assert.rejects(() => plugin.reparentTask(parent, parent), /不能将任务拖到自身上/);
    }

    {
        const { plugin, calls, moveCalls } = makePlugin();
        plugin.settings.accessToken = "token";
        const parent: any = { id: "parent", didaId: "remote-parent", title: "父任务", status: 0, projectId: "p2", projectName: "项目二" };
        const child: any = { id: "child", didaId: "remote-child", title: "子任务", status: 0, projectId: "p1", projectName: "项目一" };
        plugin.settings.tasks = [parent, child];
        await plugin.reparentTask(child, parent);
        assert.equal(child.parentId, "remote-parent");
        assert.equal(child.projectId, "p2");
        assert.deepEqual(moveCalls, [{ fromProjectId: "p1", toProjectId: "p2", taskId: "remote-child" }]);
        assert.deepEqual(calls, ["save", "refresh", "save", "save", "refresh", "move", "sync", "save", "save", "save", "refresh"]);
    }

    {
        const { plugin, calls, moveCalls } = makePlugin();
        plugin.settings.accessToken = "token";
        const child: any = { id: "child", didaId: "remote-child", title: "子任务", status: 0, projectId: "p1", projectName: "项目一", parentId: "remote-parent" };
        plugin.settings.tasks = [child];
        await plugin.moveTaskToProject(child, "p2");
        assert.equal(child.parentId, null);
        assert.equal(child.projectId, "p2");
        assert.deepEqual(moveCalls, [{ fromProjectId: "p1", toProjectId: "p2", taskId: "remote-child" }]);
        assert.deepEqual(calls, ["save", "refresh", "save", "save", "refresh", "move", "sync", "save", "save", "save", "refresh"]);
    }

    {
        const { plugin, moveCalls } = makePlugin();
        plugin.settings.accessToken = "token";
        const task: any = { id: "task", didaId: "remote-task", title: "收集箱任务", status: 0, projectId: "inbox", projectName: "收集箱" };
        plugin.settings.tasks = [task];
        await plugin.moveTaskToProject(task, "p2");
        assert.equal(task.projectId, "p2");
        assert.deepEqual(moveCalls, [{ fromProjectId: "inbox1010590000", toProjectId: "p2", taskId: "remote-task" }]);
    }

    {
        const { plugin, moveCalls } = makePlugin();
        plugin.settings.accessToken = "token";
        const task: any = { id: "task", didaId: "remote-task", title: "项目任务", status: 0, projectId: "p1", projectName: "项目一" };
        plugin.settings.tasks = [task];
        await plugin.moveTaskToProject(task, "inbox");
        assert.equal(task.projectId, "inbox");
        assert.deepEqual(moveCalls, [{ fromProjectId: "p1", toProjectId: "inbox1010590000", taskId: "remote-task" }]);
    }

    {
        const { plugin, moveCalls } = makePlugin();
        plugin.settings.accessToken = "token";
        const root: any = { id: "root", didaId: "remote-root", title: "父任务", status: 0, projectId: "p1", projectName: "项目一" };
        const child: any = { id: "child", didaId: "remote-child", title: "子任务", status: 0, projectId: "p1", projectName: "项目一", parentId: "remote-root" };
        const grandchild: any = { id: "grandchild", didaId: "remote-grandchild", title: "孙任务", status: 0, projectId: "p1", projectName: "项目一", parentId: "remote-child" };
        plugin.settings.tasks = [root, child, grandchild];
        await plugin.moveTaskToProject(root, "p2");
        assert.equal(root.projectId, "p2");
        assert.equal(child.projectId, "p2");
        assert.equal(grandchild.projectId, "p2");
        assert.equal(child.parentId, "remote-root");
        assert.equal(grandchild.parentId, "remote-child");
        assert.deepEqual(moveCalls, [
            { fromProjectId: "p1", toProjectId: "p2", taskId: "remote-root" },
            { fromProjectId: "p1", toProjectId: "p2", taskId: "remote-child" },
            { fromProjectId: "p1", toProjectId: "p2", taskId: "remote-grandchild" }
        ]);
    }

    {
        const { plugin, calls } = makePlugin();
        plugin.settings.accessToken = "token";
        const localTask: any = { id: "local-task", title: "本地普通任务", status: 0, projectId: "p1", projectName: "项目一" };
        plugin.settings.tasks = [localTask];
        await plugin.moveTaskToProject(localTask, "p2");
        assert.equal(localTask.parentId, null);
        assert.equal(localTask.projectId, "p2");
        assert.equal(localTask.projectName, "项目二");
        assert.equal(localTask.syncPlacementPending, false);
        assert.deepEqual(calls, ["save", "refresh", "save", "refresh"]);
    }

    {
        const { plugin } = makePlugin();
        plugin.settings.accessToken = "token";
        plugin.settings.projectCatalog.push({ id: "local", name: "本地任务", isArchived: false, isLocalOnly: true });
        const localParent: any = { id: "parent", title: "本地父任务", status: 0, projectId: "local", projectName: "本地任务" };
        const child: any = { id: "child", didaId: "remote-child", title: "子任务", status: 0, projectId: "p1", projectName: "项目一" };
        plugin.settings.tasks = [localParent, child];
        await assert.rejects(() => plugin.reparentTask(child, localParent), /已同步任务不能挂到本地父任务下/);
    }
}

run().then(() => {
    console.log("reparent task tests passed");
});
