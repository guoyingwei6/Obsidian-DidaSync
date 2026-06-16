import assert from "node:assert/strict";
import {
    resolveTaskNoteContextFromFrontmatter,
    resolveTaskNoteContextFromLegacyDate,
    resolveTaskNoteContextFromLegacyFileName,
    resolveTaskNoteContextFromTitle
} from "../src/taskNoteContext";

{
    const context = resolveTaskNoteContextFromFrontmatter({
        didaSyncRangeType: "week",
        didaSyncStartDate: "2025-12-29",
        didaSyncEndDate: "2026-01-04"
    });
    assert.deepEqual(context, {
        rangeType: "week",
        baseDate: "2025-12-29",
        startDate: "2025-12-29",
        endDate: "2026-01-04"
    });
}

{
    const context = resolveTaskNoteContextFromTitle("2026-W01", "monday");
    assert.deepEqual(context, {
        rangeType: "week",
        baseDate: "2025-12-29",
        startDate: "2025-12-29",
        endDate: "2026-01-04"
    });
}

{
    const context = resolveTaskNoteContextFromTitle("2026-06-01 to 2026-06-30", "monday");
    assert.deepEqual(context, {
        rangeType: "custom",
        baseDate: "2026-06-01",
        startDate: "2026-06-01",
        endDate: "2026-06-30"
    });
}

{
    const context = resolveTaskNoteContextFromTitle("2026-06", "monday");
    assert.deepEqual(context, {
        rangeType: "month",
        baseDate: "2026-06-01",
        startDate: "2026-06-01",
        endDate: "2026-06-30"
    });
}

{
    const context = resolveTaskNoteContextFromLegacyFileName("2026-06-16");
    assert.deepEqual(context, {
        rangeType: "day",
        baseDate: "2026-06-16",
        startDate: "2026-06-16",
        endDate: "2026-06-16"
    });
}

{
    const context = resolveTaskNoteContextFromLegacyDate("2026-06-16T09:00:00+08:00");
    assert.deepEqual(context, {
        rangeType: "day",
        baseDate: "2026-06-16",
        startDate: "2026-06-16",
        endDate: "2026-06-16"
    });
}

console.log("taskNoteContext tests passed");
