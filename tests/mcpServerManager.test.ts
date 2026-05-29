import assert from "node:assert/strict";
import Module from "node:module";

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === "obsidian") {
        return {
            Notice: class Notice {
                constructor(_message?: string) { }
            }
        };
    }
    if (request === "../main" || request.endsWith("/main")) {
        return class DidaSyncPlugin { };
    }
    return originalLoad.call(this, request, parent, isMain);
};

async function run() {
    const { McpServerManager } = require("../src/managers/McpServerManager");

    const task = {
        id: "local-task-1",
        didaId: "remote-task-1",
        title: "Inbox task",
        content: "",
        desc: "",
        status: 0,
        projectId: "inbox",
        projectName: "收集箱",
        updatedAt: "2026-05-29T00:00:00+08:00"
    };

    const moveCalls: Array<{ taskId: string; toProjectId: string }> = [];
    const plugin = {
        settings: {
            mcpReadOnly: false,
            tasks: [task],
            projects: [],
            completedTasks: [],
            projectCatalog: [
                { id: "inbox", name: "收集箱", isArchived: false, isLocalOnly: false },
                { id: "proj-alpha", name: "项目甲", isArchived: false, isLocalOnly: false },
                { id: "proj-beta", name: "空项目", isArchived: false, isLocalOnly: false }
            ]
        },
        getProjectCatalog() {
            return this.settings.projectCatalog;
        },
        isInboxProject(projectId: string, projectName: string) {
            const id = String(projectId || "").trim().toLowerCase();
            const name = String(projectName || "").trim().toLowerCase();
            return id === "inbox" || id.includes("inbox") || name === "收集箱" || name === "inbox";
        },
        async moveTaskToProject(targetTask: typeof task, toProjectId: string) {
            const targetProject = this.settings.projectCatalog.find((project: any) => project.id === toProjectId);
            if (!targetProject) throw new Error("Target project not found in catalog");
            moveCalls.push({ taskId: targetTask.id, toProjectId });
            targetTask.projectId = targetProject.id;
            targetTask.projectName = targetProject.name;
            targetTask.updatedAt = "2026-05-29T01:00:00+08:00";
            return targetTask;
        },
        async manualSync() { },
        async fetchCompletedTasks() { return []; },
        refreshTaskView() { },
        async saveSettings() { },
        addTask: async () => { throw new Error("not implemented"); },
        updateTaskInDidaList: async () => { throw new Error("not implemented"); },
        toggleTask: async () => { throw new Error("not implemented"); },
        deleteTask: async () => { throw new Error("not implemented"); }
    };

    const manager = new McpServerManager(plugin as any);

    const listResult = await (manager as any).callTool("dida_list_projects", {});
    const listPayload = JSON.parse(listResult.content[0].text);
    assert.equal(listPayload.ok, true, "project listing should succeed");
    assert.deepEqual(
        listPayload.data.map((project: any) => project.name),
        ["收集箱", "项目甲", "空项目"],
        "project listing should include all catalog project names"
    );

    const moveResult = await (manager as any).callTool("dida_move_task", {
        id: "local-task-1",
        toProjectId: "proj-beta"
    });
    const movePayload = JSON.parse(moveResult.content[0].text);
    assert.equal(movePayload.ok, true, "moving task via MCP should succeed");
    assert.equal(moveCalls.length, 1, "moveTaskToProject should be invoked exactly once");
    assert.deepEqual(moveCalls[0], { taskId: "local-task-1", toProjectId: "proj-beta" });
    assert.equal(movePayload.data.projectId, "proj-beta");
    assert.equal(movePayload.data.projectName, "空项目");

    console.log("MCP project listing and move test passed");
}

run()
    .finally(() => {
        (Module as any)._load = originalLoad;
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
