import assert from "node:assert/strict";
import { resolveDatePickerInitialSchedule } from "../src/modals/datePickerSchedule";

{
    const resolved = resolveDatePickerInitialSchedule(
        {
            startDate: "2026-06-20T09:00:00+0800",
            dueDate: "2026-06-20T10:00:00+0800",
            isAllDay: false,
            repeatFlag: "RRULE:FREQ=WEEKLY"
        },
        {
            startDate: "2026-06-21T13:00:00+0800",
            dueDate: "2026-06-21T14:30:00+0800",
            isAllDay: false,
            repeatFlag: "RRULE:FREQ=DAILY"
        }
    );
    assert.equal(resolved?.startDate, "2026-06-21T13:00:00+0800");
    assert.equal(resolved?.dueDate, "2026-06-21T14:30:00+0800");
    assert.equal(resolved?.repeatFlag, "RRULE:FREQ=DAILY");
}

{
    const resolved = resolveDatePickerInitialSchedule(
        {
            startDate: "2026-06-20T09:00:00+0800",
            dueDate: "2026-06-20T10:00:00+0800",
            isAllDay: false,
            repeatFlag: "RRULE:FREQ=WEEKLY"
        },
        {
            startDate: null,
            dueDate: null,
            isAllDay: true,
            repeatFlag: null
        }
    );
    assert.equal(resolved?.startDate, "2026-06-20T09:00:00+0800");
    assert.equal(resolved?.dueDate, "2026-06-20T10:00:00+0800");
    assert.equal(resolved?.repeatFlag, "RRULE:FREQ=WEEKLY");
}

{
    const resolved = resolveDatePickerInitialSchedule(
        null,
        {
            startDate: null,
            dueDate: null,
            isAllDay: true,
            repeatFlag: null
        }
    );
    assert.equal(resolved?.startDate, null);
    assert.equal(resolved?.dueDate, null);
}

console.log("Date picker schedule tests passed");
