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
    plugin.settings = {
        tasks: [],
        accessToken: "",
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
    plugin.apiClient = {
        async moveTask(_fromProjectId: string, _toProjectId: string, _taskId: string) {
            calls.push("move");
        }
    };
    plugin.syncManager = new SyncManager(plugin);
    plugin.syncManager.updateTaskInDidaList = async () => {
        calls.push("sync");
        await plugin.syncManager.clearOperation(currentTaskForSync);
    };
    let currentTaskForSync: any = null;
    plugin.syncManager.queueOperation = async function (task: any, type: string, payload: any) {
        currentTaskForSync = task;
        return SyncManager.prototype.queueOperation.call(this, task, type as any, payload);
    };
    return { plugin, calls };
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
        const { plugin, calls } = makePlugin();
        plugin.settings.accessToken = "token";
        const parent: any = { id: "parent", didaId: "remote-parent", title: "父任务", status: 0, projectId: "p2", projectName: "项目二" };
        const child: any = { id: "child", didaId: "remote-child", title: "子任务", status: 0, projectId: "p1", projectName: "项目一" };
        plugin.settings.tasks = [parent, child];
        await plugin.reparentTask(child, parent);
        assert.equal(child.parentId, "remote-parent");
        assert.equal(child.projectId, "p2");
        assert.deepEqual(calls, ["save", "refresh", "save", "save", "refresh", "move", "sync", "save"]);
    }

    {
        const { plugin, calls } = makePlugin();
        plugin.settings.accessToken = "token";
        const child: any = { id: "child", didaId: "remote-child", title: "子任务", status: 0, projectId: "p1", projectName: "项目一", parentId: "remote-parent" };
        plugin.settings.tasks = [child];
        await plugin.moveTaskToProject(child, "p2");
        assert.equal(child.parentId, null);
        assert.equal(child.projectId, "p2");
        assert.deepEqual(calls, ["save", "refresh", "save", "save", "refresh", "move", "sync", "save"]);
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
