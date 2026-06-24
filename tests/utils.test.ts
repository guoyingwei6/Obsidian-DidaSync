import { strict as assert } from "assert";
import Module from "node:module";

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === "obsidian") {
        return { setIcon: () => { } };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const {
    normalizePomodoroPresetMinutes,
    normalizePomodoroCompletionHistory,
    getTimerRemainingSeconds,
    compareVersions,
    compareProjectGroups,
    translateRepeatFlag,
    safeDecode
} = require("../src/utils");

assert.deepEqual(normalizePomodoroPresetMinutes([25, "40", 25, 0, 120] as any, 1, 90, [15, 25]), [25, 40]);
assert.deepEqual(normalizePomodoroPresetMinutes([], 1, 90, [15, 25]), [15, 25]);

assert.deepEqual(normalizePomodoroCompletionHistory({
    "2026-06-24": { sessions: "2" as any, minutes: "50" as any },
    "bad-key": { sessions: 9, minutes: 9 },
    "2026-06-25": { sessions: -1, minutes: NaN }
}), {
    "2026-06-24": { sessions: 2, minutes: 50 },
    "2026-06-25": { sessions: 0, minutes: 0 }
});

assert.equal(getTimerRemainingSeconds(61_000, 1_000), 60);
assert.equal(getTimerRemainingSeconds(1_001, 1_000), 1);
assert.equal(getTimerRemainingSeconds(999, 1_000), 0);

assert.equal(compareVersions("1.5.4", "1.5.3"), 1);
assert.equal(compareVersions("1.5", "1.5.0"), 0);
assert.equal(compareVersions("1.4.9", "1.5.0"), -1);
assert.deepEqual(translateRepeatFlag("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE"), { label: "每 2 周的 周一、周三", icon: "repeat" });
assert.equal(
    compareProjectGroups(
        { name: "空项目", taskCount: 0 },
        { name: "项目甲", taskCount: 3 },
        ["空项目", "项目甲"]
    ),
    1
);
assert.equal(
    compareProjectGroups(
        { name: "项目乙", taskCount: 2 },
        { name: "项目甲", taskCount: 1 },
        ["项目乙", "项目甲"]
    ),
    -1
);
assert.equal(safeDecode("hello%20world"), "hello world");

console.log("utils tests passed");
