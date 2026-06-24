import assert from "node:assert/strict";
import {
    clearTaskSchedule,
    createTaskScheduleState,
    setTaskScheduleEndMinutes,
    setTaskScheduleStartMinutes,
    taskScheduleStateToValue
} from "../src/taskSchedule";

const now = new Date(2026, 5, 24, 10, 7, 0, 0);

const fresh = createTaskScheduleState({ now });
assert.equal(fresh.isScheduled, true);
assert.equal(fresh.isAllDay, true);
assert.equal(fresh.startMinutes, 10 * 60 + 15);
assert.equal(taskScheduleStateToValue(fresh).startDate?.getHours(), 0);

const timed = createTaskScheduleState({
    now,
    startDate: new Date(2026, 5, 26, 9, 30),
    dueDate: new Date(2026, 5, 26, 10, 45),
    isAllDay: false,
    repeatFlag: "RRULE:FREQ=WEEKLY"
});
let timedValue = taskScheduleStateToValue(timed);
assert.equal(timed.startMinutes, 9 * 60 + 30);
assert.equal(timed.endMinutes, 10 * 60 + 45);
assert.equal(timedValue.startDate?.getHours(), 9);
assert.equal(timedValue.dueDate?.getMinutes(), 45);
assert.equal(timedValue.repeatFlag, "RRULE:FREQ=WEEKLY");

setTaskScheduleStartMinutes(timed, 23 * 60 + 45);
assert.equal(timed.endMinutes, 1440);
setTaskScheduleEndMinutes(timed, 10 * 60);
assert.equal(timed.endMinutes, 1440);
timedValue = taskScheduleStateToValue(timed);
assert.equal(timedValue.dueDate?.getDate(), 27);
assert.equal(timedValue.dueDate?.getHours(), 0);

clearTaskSchedule(timed);
const cleared = taskScheduleStateToValue(timed);
assert.equal(cleared.startDate, null);
assert.equal(cleared.dueDate, null);
assert.equal(cleared.isAllDay, false);
assert.equal(cleared.repeatFlag, null);

console.log("Task schedule tests passed");
