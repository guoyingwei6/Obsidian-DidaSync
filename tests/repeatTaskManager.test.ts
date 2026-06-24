import assert from "node:assert/strict";
import Module from "node:module";

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === "../main" || request.endsWith("/main")) {
        return class DidaSyncPlugin { };
    }
    return originalLoad.call(this, request, parent, isMain);
};

async function run() {
    const { RepeatTaskManager } = require("../src/managers/RepeatTaskManager");
    let saveCount = 0;
    const plugin = {
        settings: {
            accessToken: "",
            tasks: [
                { id: "sub-1", didaId: "sub-remote-1", title: "Child", status: 2, parentId: "remote-parent", projectId: "inbox" }
            ]
        },
        async saveSettings() { saveCount++; },
        refreshTaskView() { },
        async createTaskInDidaList() { throw new Error("should not sync without token"); }
    };
    const manager = new RepeatTaskManager(plugin as any);
    (manager as any).generateTaskId = (() => {
        let index = 0;
        return () => `generated-${++index}`;
    })();
    (manager as any).generateItemId = (() => {
        let index = 0;
        return () => `item-${++index}`;
    })();

    const copy = await manager.createRepeatTaskCopy({
        id: "parent",
        didaId: "remote-parent",
        title: "Daily repeat",
        content: "",
        desc: "",
        status: 2,
        projectId: "inbox",
        dueDate: "2026-06-24T10:00:00.000Z",
        startDate: "2026-06-24T09:00:00.000Z",
        repeatFlag: "RRULE:FREQ=DAILY;INTERVAL=1",
        completedTime: "2026-06-24T10:00:00.000Z",
        items: [
            { id: "old-item", title: "Checklist", status: 1, completedTime: "2026-06-24T10:00:00.000Z" }
        ]
    } as any);

    assert.ok(copy);
    assert.equal(copy.id, "generated-1");
    assert.equal(copy.didaId, undefined);
    assert.equal(copy.status, 0);
    assert.equal(copy.completedTime, undefined);
    assert.match(copy.dueDate || "", /^2026-06-25/);
    assert.match(copy.startDate || "", /^2026-06-25T09:00:00/);
    assert.equal(copy.items?.[0].id, "item-1");
    assert.equal(copy.items?.[0].status, 0);
    assert.equal(copy.items?.[0].completedTime, undefined);
    assert.equal(plugin.settings.tasks.some((task: any) => task.id === "generated-2" && task.title === "Child" && task.status === 0), true);
    assert.equal(saveCount, 2);

    const noRepeat = await manager.createRepeatTaskCopy({ id: "x", title: "No repeat", status: 0, projectId: "inbox" } as any);
    assert.equal(noRepeat, null);

    console.log("RepeatTaskManager copy tests passed");
}

run()
    .finally(() => {
        (Module as any)._load = originalLoad;
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
