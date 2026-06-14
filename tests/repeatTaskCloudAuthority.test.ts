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
    if (request === "../views/TaskView" || request.endsWith("/views/TaskView")) {
        return {
            TASK_VIEW_TYPE: "dida-task-view",
            TaskView: class TaskView { }
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

async function run() {
    const { SyncManager } = require("../src/managers/SyncManager");

    const localRepeatCopy = {
        id: "local-repeat-copy",
        title: "每日任务",
        content: "",
        desc: "",
        didaId: undefined,
        projectId: "inbox",
        dueDate: "2026-06-15T00:00:00+0800",
        startDate: "2026-06-15T00:00:00+0800",
        repeatFlag: "RRULE:FREQ=DAILY;INTERVAL=1",
        status: 0,
        updatedAt: "2026-06-14T08:00:00+0800",
        items: []
    };

    const remoteRepeatTask = {
        id: "remote-repeat-next",
        title: "每日任务",
        content: "",
        desc: "",
        projectId: "inbox",
        dueDate: "2026-06-15T00:00:00+0800",
        startDate: "2026-06-15T00:00:00+0800",
        repeatFlag: "RRULE:FREQ=DAILY;INTERVAL=1",
        status: 0,
        etag: "remote-etag",
        isAllDay: true,
        kind: "TEXT",
        reminders: [],
        priority: 0,
        createdTime: "2026-06-14T08:01:00+0800"
    };

    let saveCount = 0;
    const plugin = {
        settings: {
            tasks: [localRepeatCopy]
        },
        async saveSettings() {
            saveCount++;
        }
    };

    const manager = new SyncManager(plugin as any);
    const matchIndex = manager.findLocalRepeatTaskCopyIndex(remoteRepeatTask);
    assert.equal(matchIndex, 0, "remote repeat instance should match the old local optimistic copy");

    const merged = await manager.mergeRemoteRepeatTaskIntoLocalCopy(matchIndex, remoteRepeatTask, {
        id: "inbox",
        name: "收集箱"
    });

    assert.equal(plugin.settings.tasks.length, 1, "merge must not append a second task");
    assert.equal(merged.didaId, "remote-repeat-next");
    assert.equal(merged.etag, "remote-etag");
    assert.equal(merged.projectName, "收集箱");
    assert.equal(saveCount, 1, "merge should persist the remote id binding");

    console.log("repeat task cloud authority regression test passed");
}

run()
    .finally(() => {
        (Module as any)._load = originalLoad;
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
