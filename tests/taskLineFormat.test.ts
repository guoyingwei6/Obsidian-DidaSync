import { strict as assert } from "assert";
import { formatTaskLine, formatTaskLineFromTask, parseTaskLine } from "../src/taskLineFormat";

const didaId = "6a24462bc500bf31a90ce7dd";

{
    const parsed = parseTaskLine(`- [ ] 数电MOOC [Dida](obsidian://dida-task?didaId=${didaId}) 2026-06-09`);
    assert.ok(parsed);
    assert.equal(parsed.quotePrefix, "");
    assert.equal(parsed.checkbox, " ");
    assert.equal(parsed.title, "数电MOOC");
    assert.equal(parsed.didaId, didaId);
    assert.ok(parsed.dueDate?.includes("2026-06-09"));
}

{
    const parsed = parseTaskLine(`> - [x] 数电MOOC [Dida](obsidian://dida-task?didaId=${didaId}) 2026-06-09`);
    assert.ok(parsed);
    assert.equal(parsed.quotePrefix, "> ");
    assert.equal(parsed.checkbox, "x");
    assert.equal(parsed.title, "数电MOOC");
    assert.equal(parsed.didaId, didaId);
    assert.ok(parsed.dueDate?.includes("2026-06-09"));
}

{
    const parsed = parseTaskLine(`> > - [ ] 嵌套任务 [🔗Dida](obsidian://dida-task?didaId=${didaId}) 2026-06-09`);
    assert.ok(parsed);
    assert.equal(parsed.quotePrefix, "> > ");
    assert.equal(parsed.title, "嵌套任务");
    assert.equal(parsed.didaId, didaId);
}

{
    const line = `> - [ ] 数电MOOC [Dida](obsidian://dida-task?didaId=${didaId}) 2026-06-09`;
    const updated = formatTaskLine(line, {
        checkbox: "x",
        title: "数字电路 MOOC",
        dueDate: "2026-06-10T00:00:00+0800",
        isAllDay: true
    });
    assert.ok(updated.startsWith("> - [x] 数字电路 MOOC "));
    assert.ok(updated.includes(`didaId=${didaId}`));
    assert.ok(updated.includes("2026-06-10"));
}

{
    const line = formatTaskLineFromTask({
        id: "local-id",
        title: "完整任务",
        status: 0,
        didaId,
        dueDate: "2026-06-09T00:00:00+0800",
        startDate: "2026-06-09T00:00:00+0800",
        isAllDay: true,
        priority: 3,
        repeatFlag: "RRULE:FREQ=WEEKLY;INTERVAL=1"
    } as any, "", "> ");
    assert.ok(line.startsWith("> - [ ] 完整任务 "));
    assert.ok(line.includes(`didaId=${didaId}`));
    assert.ok(line.includes("2026-06-09"));
    assert.ok(line.includes("every week"));
}

console.log("taskLineFormat tests passed");
