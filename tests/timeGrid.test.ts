import { clampMinutes, dateAtMinutes, getTimeGridDay, getTimeGridRange, gridStartMinutes, isAllDayTimeGridTask, roundDateUpToStep, snapDuration, snapMinutes, taskBelongsToTimeGridDate, TIME_GRID_STEP_MINUTES } from "../src/timeGrid";

function assertEqual(actual: unknown, expected: unknown, message: string) {
    if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

assertEqual(TIME_GRID_STEP_MINUTES, 15, "grid step");
assertEqual(snapMinutes(7), 0, "nearest lower slot");
assertEqual(snapMinutes(8), 15, "nearest upper slot");
assertEqual(snapMinutes(52, "floor"), 45, "floor slot");
assertEqual(snapMinutes(52, "ceil"), 60, "ceil slot");
assertEqual(snapMinutes(1433), 1440, "end-of-day boundary");
assertEqual(snapDuration(1), 15, "minimum duration");
assertEqual(snapDuration(52), 45, "duration normalization");
assertEqual(clampMinutes(-15), 0, "lower clamp");
assertEqual(clampMinutes(1455), 1440, "upper clamp");
assertEqual(gridStartMinutes(1432.5), 1425, "last grid start slot");
assertEqual(gridStartMinutes(1440), 1425, "grid bottom does not wrap to midnight");

const base = new Date(2026, 5, 23, 12, 30);
const nextDay = dateAtMinutes(base, 1485);
assertEqual(nextDay.getDate(), 24, "cross-midnight date");
assertEqual(nextDay.getHours(), 0, "cross-midnight hour");
assertEqual(nextDay.getMinutes(), 45, "cross-midnight minute");

const roundedMidnight = roundDateUpToStep(new Date(2026, 5, 23, 23, 52, 30));
assertEqual(roundedMidnight.getDate(), 24, "rounded date advances at midnight");
assertEqual(roundedMidnight.getHours(), 0, "rounded midnight hour");
assertEqual(roundedMidnight.getMinutes(), 0, "rounded midnight minute");

const gridDate = new Date(2026, 5, 23);
const range = getTimeGridRange(gridDate, 6);
assertEqual(range.start.getDate(), 23, "grid starts on selected date");
assertEqual(range.start.getHours(), 6, "grid start hour");
assertEqual(range.end.getDate(), 24, "grid ends on next date");
assertEqual(range.end.getHours(), 6, "grid end hour");

assertEqual(getTimeGridDay(new Date(2026, 5, 24, 2), 6).getDate(), 23, "early morning belongs to previous grid day");
assertEqual(getTimeGridDay(new Date(2026, 5, 24, 6), 6).getDate(), 24, "grid start belongs to current grid day");

const earlyMorningTask = {
    startDate: new Date(2026, 5, 24, 2).toISOString(),
    dueDate: new Date(2026, 5, 24, 3).toISOString(),
    isAllDay: false
};
assertEqual(taskBelongsToTimeGridDate(earlyMorningTask, gridDate, 6), true, "cross-midnight task remains in originating grid");
assertEqual(taskBelongsToTimeGridDate(earlyMorningTask, new Date(2026, 5, 24), 6), false, "cross-midnight task is not duplicated in next grid");

const allDayTask = {
    startDate: new Date(2026, 5, 24, 0).toISOString(),
    dueDate: new Date(2026, 5, 24, 0).toISOString(),
    isAllDay: true
};
assertEqual(isAllDayTimeGridTask(allDayTask), true, "explicit all-day task without special due-date handling");
assertEqual(taskBelongsToTimeGridDate(allDayTask, gridDate, 6), false, "all-day task is not assigned to previous grid");
assertEqual(taskBelongsToTimeGridDate(allDayTask, new Date(2026, 5, 24), 6), true, "all-day task stays on calendar date");

const yearEndRange = getTimeGridRange(new Date(2026, 11, 31), 6);
assertEqual(yearEndRange.end.getFullYear(), 2027, "grid range crosses year boundary");
assertEqual(yearEndRange.end.getMonth(), 0, "year boundary month");
assertEqual(yearEndRange.end.getDate(), 1, "year boundary date");

console.log("timeGrid tests passed");
