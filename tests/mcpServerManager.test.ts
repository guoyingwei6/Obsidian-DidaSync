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
        getUserTimeZone() { return "America/New_York"; },
        getUserTimeZoneDateTimeExample() { return "2026-06-19T11:00:00-04:00"; },
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

    const tools = (manager as any).getTools();
    const updateTool = tools.find((tool: any) => tool.name === "dida_update_task");
    assert.ok(updateTool.inputSchema.properties.startDate.pattern, "date schema should include a regex pattern");
    assert.match(updateTool.inputSchema.properties.startDate.description, /America\/New_York/, "date schema should mention the configured user timezone");
    assert.match(updateTool.inputSchema.properties.startDate.description, /2026-06-19T11:00:00-04:00/, "date schema should include a timezone-specific example");

    const offsetDateResult = await (manager as any).callTool("dida_update_task", {
        id: "local-task-1",
        startDate: "2026-06-19T11:00:00-04:00",
        dueDate: "2026-06-19T12:00:00-04:00",
        isAllDay: false
    });
    const offsetDatePayload = JSON.parse(offsetDateResult.content[0].text);
    assert.equal(offsetDatePayload.ok, true, "timezone-aware datetime should be accepted");

    const compactOffsetResult = await (manager as any).callTool("dida_update_task", {
        id: "local-task-1",
        startDate: "2026-06-19T11:00:00-0400",
        dueDate: "2026-06-19T12:00:00-0400",
        isAllDay: false
    });
    const compactOffsetPayload = JSON.parse(compactOffsetResult.content[0].text);
    assert.equal(compactOffsetPayload.ok, true, "compact timezone offset should remain accepted");

    const minutePrecisionResult = await (manager as any).callTool("dida_update_task", {
        id: "local-task-1",
        startDate: "2026-06-19T11:00-04:00",
        dueDate: "2026-06-19T12:00-04:00",
        isAllDay: false
    });
    const minutePrecisionPayload = JSON.parse(minutePrecisionResult.content[0].text);
    assert.equal(minutePrecisionPayload.ok, true, "minute-precision timezone-aware datetime should be accepted");

    const minutePrecisionCompactResult = await (manager as any).callTool("dida_update_task", {
        id: "local-task-1",
        startDate: "2026-06-19T11:00-0400",
        dueDate: "2026-06-19T12:00-0400",
        isAllDay: false
    });
    const minutePrecisionCompactPayload = JSON.parse(minutePrecisionCompactResult.content[0].text);
    assert.equal(minutePrecisionCompactPayload.ok, true, "minute-precision compact timezone offset should be accepted");

    const minutePrecisionZuluResult = await (manager as any).callTool("dida_update_task", {
        id: "local-task-1",
        startDate: "2026-06-19T15:00Z",
        dueDate: "2026-06-19T16:00Z",
        isAllDay: false
    });
    const minutePrecisionZuluPayload = JSON.parse(minutePrecisionZuluResult.content[0].text);
    assert.equal(minutePrecisionZuluPayload.ok, true, "minute-precision Z datetime should be accepted");

    const dateOnlyResult = await (manager as any).callTool("dida_update_task", {
        id: "local-task-1",
        startDate: "2026-06-19",
        dueDate: "2026-06-19",
        isAllDay: true
    });
    const dateOnlyPayload = JSON.parse(dateOnlyResult.content[0].text);
    assert.equal(dateOnlyPayload.ok, true, "date-only all-day value should be accepted");

    const naiveDateResult = await (manager as any).callTool("dida_update_task", {
        id: "local-task-1",
        startDate: "2026-06-19T11:00:00",
        isAllDay: false
    });
    const naiveDatePayload = JSON.parse(naiveDateResult.content[0].text);
    assert.equal(naiveDatePayload.ok, false, "timezone-naive datetime should be rejected");
    assert.match(naiveDatePayload.error.message, /timezone offset/, "rejection should explain missing timezone offset");
    assert.match(naiveDatePayload.error.message, /America\/New_York/, "rejection should mention configured user timezone");

    const minuteNaiveDateResult = await (manager as any).callTool("dida_update_task", {
        id: "local-task-1",
        startDate: "2026-06-19T11:00",
        isAllDay: false
    });
    const minuteNaiveDatePayload = JSON.parse(minuteNaiveDateResult.content[0].text);
    assert.equal(minuteNaiveDatePayload.ok, false, "minute-precision timezone-naive datetime should be rejected");
    assert.match(minuteNaiveDatePayload.error.message, /timezone offset/);

    const scheduleResult = await (manager as any).callTool("dida_schedule_tasks", {
        items: [
            {
                id: "local-task-1",
                startDate: "2026-06-19T11:00:00",
                isAllDay: false
            }
        ],
        sync: false
    });
    const schedulePayload = JSON.parse(scheduleResult.content[0].text);
    assert.equal(schedulePayload.ok, true, "batch scheduling should return a structured result");
    assert.equal(schedulePayload.data.updated.length, 0);
    assert.equal(schedulePayload.data.errors.length, 1);
    assert.match(schedulePayload.data.errors[0].message, /timezone offset/);

    console.log("MCP project listing, move, and date validation tests passed");
}

run()
    .finally(() => {
        (Module as any)._load = originalLoad;
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
