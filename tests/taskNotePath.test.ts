import assert from "node:assert/strict";
import {
    buildDefaultTaskNoteFileName,
    buildTaskNoteRelativePath,
    buildTaskNoteTargetFilePath,
    getTaskNoteWeekInfo,
    getTaskNoteWeekRange,
    getTaskNoteWeekStem
} from "../src/taskNotePath";

{
    const path = buildTaskNoteTargetFilePath(
        {
            type: "day",
            startDate: "2026-06-16",
            endDate: "2026-06-16"
        },
        {
            rootFolder: "Life",
            weekStart: "monday",
            pathPatterns: {
                day: "YYYY/日记/YYYY-MM-DD"
            }
        }
    );
    assert.equal(path, "Life/2026/日记/2026-06-16.md");
}

{
    const weekRange = getTaskNoteWeekRange("2026-01-04", "sunday");
    assert.deepEqual(weekRange, {
        startDate: "2026-01-04",
        endDate: "2026-01-10"
    });

    const weekInfo = getTaskNoteWeekInfo("2026-01-04", "sunday");
    assert.deepEqual(weekInfo, {
        year: 2026,
        week: 2
    });
}

{
    const crossYearRange = getTaskNoteWeekRange("2025-12-29", "monday");
    assert.deepEqual(crossYearRange, {
        startDate: "2025-12-29",
        endDate: "2026-01-04"
    });

    assert.equal(getTaskNoteWeekStem("2025-12-29", "monday"), "2026-W01");
    assert.equal(
        buildDefaultTaskNoteFileName(
            { type: "week", startDate: "2025-12-29", endDate: "2026-01-04" },
            "monday"
        ),
        "2026-W01.md"
    );
    assert.equal(
        buildTaskNoteRelativePath(
            {
                type: "week",
                startDate: "2025-12-29",
                endDate: "2026-01-04"
            },
            {
                weekStart: "monday",
                pathPatterns: {
                    week: "gggg/周记/[W]ww"
                }
            }
        ),
        "2026/周记/W01.md"
    );
}

{
    const sundayRelative = buildTaskNoteRelativePath(
        {
            type: "week",
            startDate: "2026-01-04",
            endDate: "2026-01-10"
        },
        {
            weekStart: "sunday",
            pathPatterns: {
                week: "gggg/周记/[W]ww"
            }
        }
    );

    assert.equal(sundayRelative, "2026/周记/W02.md");
    assert.equal(
        buildDefaultTaskNoteFileName(
            { type: "week", startDate: "2026-01-04", endDate: "2026-01-10" },
            "sunday"
        ),
        "2026-W02.md"
    );
}

{
    const monthRelative = buildTaskNoteRelativePath(
        {
            type: "month",
            startDate: "2026-01-01",
            endDate: "2026-01-31"
        },
        {
            weekStart: "monday",
            pathPatterns: {
                month: "YYYY/月记/YYYY-MM"
            }
        }
    );

    assert.equal(monthRelative, "2026/月记/2026-01.md");
}

{
    const customRelative = buildTaskNoteRelativePath(
        {
            type: "custom",
            startDate: "2026-06-01",
            endDate: "2026-06-30"
        },
        {
            weekStart: "monday",
            pathPatterns: {
                day: "YYYY/日记/YYYY-MM-DD",
                week: "gggg/周记/[W]ww",
                month: "YYYY/月记/YYYY-MM",
                year: "YYYY"
            }
        }
    );
    assert.equal(customRelative, "2026-06-01_to_2026-06-30.md");
}

{
    const path = buildTaskNoteTargetFilePath(
        {
            type: "day",
            startDate: "2026-05-29",
            endDate: "2026-05-29"
        },
        {
            rootFolder: "Documents",
            weekStart: "monday",
            pathPatterns: {
                day: "Dailynote/YYYY-MM-DD"
            }
        }
    );
    assert.equal(path, "Documents/Dailynote/2026-05-29.md");
}

console.log("taskNotePath tests passed");
