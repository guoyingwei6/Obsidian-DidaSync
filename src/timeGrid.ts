export const TIME_GRID_STEP_MINUTES = 15;
export const MIN_TIME_BLOCK_MINUTES = TIME_GRID_STEP_MINUTES;

export function snapMinutes(minutes: number, mode: "nearest" | "ceil" | "floor" = "nearest"): number {
    const ratio = minutes / TIME_GRID_STEP_MINUTES;
    const rounded = mode === "ceil" ? Math.ceil(ratio) : mode === "floor" ? Math.floor(ratio) : Math.round(ratio);
    return rounded * TIME_GRID_STEP_MINUTES;
}

export function snapDuration(minutes: number): number {
    return Math.max(MIN_TIME_BLOCK_MINUTES, snapMinutes(minutes));
}

export function clampMinutes(minutes: number, minimum: number = 0, maximum: number = 1440): number {
    return Math.max(minimum, Math.min(maximum, minutes));
}

export function gridStartMinutes(relativeMinutes: number, startHour: number = 0): number {
    const latestStart = 1440 - TIME_GRID_STEP_MINUTES;
    return startHour * 60 + clampMinutes(snapMinutes(relativeMinutes), 0, latestStart);
}

export function dateAtMinutes(baseDate: Date, minutes: number): Date {
    const result = new Date(baseDate);
    result.setHours(0, 0, 0, 0);
    result.setMinutes(minutes);
    return result;
}

export function roundDateUpToStep(date: Date): Date {
    const result = new Date(date);
    const hasPartialMinute = result.getSeconds() !== 0 || result.getMilliseconds() !== 0;
    const remainder = result.getMinutes() % TIME_GRID_STEP_MINUTES;
    const delta = remainder === 0 && !hasPartialMinute ? 0 : TIME_GRID_STEP_MINUTES - remainder;
    result.setSeconds(0, 0);
    result.setMinutes(result.getMinutes() + delta);
    return result;
}

export interface TimeGridTaskLike {
    parentId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    isAllDay?: boolean;
}

export function getTimeGridRange(gridDate: Date, startHour: number): { start: Date; end: Date } {
    const start = new Date(gridDate);
    start.setHours(startHour, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
}

export function getTimeGridDay(date: Date, startHour: number): Date {
    const gridDay = new Date(date);
    if (gridDay.getHours() < startHour) gridDay.setDate(gridDay.getDate() - 1);
    gridDay.setHours(0, 0, 0, 0);
    return gridDay;
}

export function isAllDayTimeGridTask(task: TimeGridTaskLike): boolean {
    if (typeof task.isAllDay === "boolean") return task.isAllDay;
    if (!task.dueDate) return false;
    const dueDate = new Date(task.dueDate);
    return !isNaN(dueDate.getTime()) && dueDate.getHours() === 0 && dueDate.getMinutes() === 0;
}

export function taskBelongsToTimeGridDate(task: TimeGridTaskLike, gridDate: Date, startHour: number): boolean {
    if (task.parentId) return false;
    const taskDateValue = task.startDate || task.dueDate;
    if (!taskDateValue) return false;
    const taskDate = new Date(taskDateValue);
    if (isNaN(taskDate.getTime())) return false;

    if (isAllDayTimeGridTask(task)) {
        const taskDay = new Date(taskDate);
        const targetDay = new Date(gridDate);
        taskDay.setHours(0, 0, 0, 0);
        targetDay.setHours(0, 0, 0, 0);
        return taskDay.getTime() === targetDay.getTime();
    }

    const { start, end } = getTimeGridRange(gridDate, startHour);
    return taskDate.getTime() >= start.getTime() && taskDate.getTime() < end.getTime();
}
