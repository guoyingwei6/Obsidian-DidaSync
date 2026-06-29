import { strict as assert } from "assert";
import { buildDidaTaskDragPayload, buildDidaTaskFilterSets, buildDidaTaskTreeNodes, buildDidaTaskVisibleTaskKeys, getDidaTaskPath, normalizeDidaTaskCollapsedStates, resolveDidaTaskCollapsedState } from "../src/taskTree";
import { DidaTask } from "../src/types";

function task(id: string, title: string, parentId: string | null = null): DidaTask {
    return {
        id,
        didaId: id,
        title,
        content: "",
        status: 0,
        projectId: "p1",
        projectName: "项目",
        parentId
    };
}

{
    const tasks = [
        task("root", "主任务"),
        task("child-a", "子任务 A", "root"),
        task("child-b", "子任务 B", "root"),
        task("grand", "孙任务", "child-a")
    ];
    const tree = buildDidaTaskTreeNodes(tasks);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].children.length, 2);
    assert.equal(tree[0].children[0].children[0].task.title, "孙任务");
}

{
    const tasks = [
        task("root", "主任务"),
        task("child", "子任务", "root"),
        task("grand", "孙任务", "child")
    ];
    const payload = buildDidaTaskDragPayload(tasks[1], tasks);
    const lines = payload.split("\n");
    assert.equal(lines.length, 2);
    assert.ok(lines[0].startsWith("- [ ] 子任务 "));
    assert.ok(lines[1].startsWith("\t- [ ] 孙任务 "));
    assert.ok(!payload.includes("主任务"));
}

{
    const tasks = [
        task("root", "主任务"),
        task("child", "子任务", "root"),
        task("grand", "孙任务", "child")
    ];
    assert.equal(getDidaTaskPath(tasks[2], tasks), "主任务 / 子任务 / 孙任务");
}

{
    const parent = task("local-parent", "父任务");
    parent.didaId = "remote-parent";
    const child = task("child", "旧子任务", "local-parent");
    const tasks = [parent, child];
    const tree = buildDidaTaskTreeNodes(tasks);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].task.title, "父任务");
    assert.equal(tree[0].children.length, 1);
    assert.equal(tree[0].children[0].task.title, "旧子任务");
    assert.equal(getDidaTaskPath(child, tasks), "父任务 / 旧子任务");
}

{
    const parent = task("local-parent", "父任务");
    parent.didaId = "remote-parent";
    const child = task("child", "旧子任务", "local-parent");
    const payload = buildDidaTaskDragPayload(parent, [parent, child]);
    assert.ok(payload.includes("父任务"));
    assert.ok(payload.includes("旧子任务"));
    assert.equal(payload.split("\n").length, 2);
}

{
    const a = task("a", "A", "b");
    const b = task("b", "B", "a");
    const payload = buildDidaTaskDragPayload(a, [a, b]);
    assert.equal(payload.split("\n").length, 2);
}

{
    const tasks = [
        task("a", "A"),
        task("b", "B", "a"),
        task("c", "C", "b")
    ];
    const sets = buildDidaTaskFilterSets(tasks, [tasks[2]]);
    assert.deepEqual(Array.from(sets.matchedTaskKeys), ["c"]);
    assert.deepEqual(Array.from(sets.renderableTaskKeys), ["c", "b", "a"]);
}

{
    const tasks = [
        task("root", "主任务"),
        task("child", "子任务", "root"),
        task("grand", "孙任务", "child")
    ];
    const visible = buildDidaTaskVisibleTaskKeys(tasks, {
        collapsedTaskKeys: new Set(["root"])
    });
    assert.deepEqual(Array.from(visible), ["root"]);
}

{
    const tasks = [
        task("root", "主任务"),
        task("child", "子任务", "root"),
        task("grand", "孙任务", "child")
    ];
    const visible = buildDidaTaskVisibleTaskKeys(tasks, {
        collapsedTaskKeys: new Set(["root"]),
        forceExpandedTaskKeys: new Set(["root", "child", "grand"])
    });
    assert.deepEqual(Array.from(visible), ["root", "child", "grand"]);
}

{
    const parent = task("root", "主任务");
    const child = task("child", "子任务", "root");
    assert.equal(resolveDidaTaskCollapsedState(parent, 1, {}), true);
    assert.equal(resolveDidaTaskCollapsedState(parent, 1, { root: false }), false);
    assert.equal(resolveDidaTaskCollapsedState(child, 0, { child: true }), false);
}

{
    const tasks = [
        task("root", "主任务"),
        task("child", "子任务", "root"),
        task("leaf", "叶子任务")
    ];
    const normalized = normalizeDidaTaskCollapsedStates(tasks, {
        root: false,
        child: true,
        ghost: true,
        leaf: true
    });
    assert.deepEqual(normalized, { root: false });
}

{
    const parent = task("local-parent", "父任务");
    parent.didaId = "remote-parent";
    const child = task("child", "子任务", "local-parent");
    const normalized = normalizeDidaTaskCollapsedStates([parent, child], {
        "local-parent": false
    });
    assert.deepEqual(normalized, { "remote-parent": false });
}

console.log("taskTree tests passed");
