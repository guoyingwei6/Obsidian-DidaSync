export const TASK_SCHEDULE_STEP_MINUTES = 15;

export interface TaskScheduleState {
    selectedDate: Date;
    displayYear: number;
    displayMonth: number;
    isScheduled: boolean;
    isAllDay: boolean;
    startMinutes: number;
    endMinutes: number;
    repeatFlag: string | null;
}

export interface TaskScheduleValue {
    startDate: Date | null;
    dueDate: Date | null;
    isAllDay: boolean;
    repeatFlag: string | null;
}

export interface TaskScheduleStateOptions {
    startDate?: string | Date | null;
    dueDate?: string | Date | null;
    isAllDay?: boolean;
    repeatFlag?: string | null;
    isScheduled?: boolean;
    defaultDate?: Date;
    now?: Date;
}

function parseDate(value?: string | Date | null): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value) : new Date(value);
    return isNaN(date.getTime()) ? null : date;
}

function minutesOfDay(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
}

export function roundMinutesUp(date: Date, step: number = TASK_SCHEDULE_STEP_MINUTES): number {
    const minutes = minutesOfDay(date);
    return Math.min(23 * 60 + 45, Math.ceil(minutes / step) * step);
}

export function createTaskScheduleState(options: TaskScheduleStateOptions = {}): TaskScheduleState {
    const now = new Date(options.now || new Date());
    const start = parseDate(options.startDate);
    const due = parseDate(options.dueDate);
    const fallback = new Date(options.defaultDate || now);
    const selectedDate = new Date(start || due || fallback);
    selectedDate.setHours(0, 0, 0, 0);

    const startMinutes = start ? minutesOfDay(start) : roundMinutesUp(now);
    let endMinutes = startMinutes + 60;
    if (due) {
        const dueDay = new Date(due);
        dueDay.setHours(0, 0, 0, 0);
        endMinutes = dueDay.getTime() > selectedDate.getTime() ? 1440 : minutesOfDay(due);
    }
    if (endMinutes <= startMinutes) endMinutes = Math.min(1440, startMinutes + 60);

    return {
        selectedDate,
        displayYear: selectedDate.getFullYear(),
        displayMonth: selectedDate.getMonth(),
        isScheduled: options.isScheduled !== undefined
            ? options.isScheduled
            : !!(start || due) || options.defaultDate !== undefined || (!options.startDate && !options.dueDate),
        isAllDay: options.isAllDay !== undefined ? options.isAllDay : true,
        startMinutes,
        endMinutes: Math.min(1440, endMinutes),
        repeatFlag: options.repeatFlag || null
    };
}

export function setTaskScheduleStartMinutes(state: TaskScheduleState, minutes: number): void {
    state.startMinutes = Math.max(0, Math.min(1425, minutes));
    if (state.endMinutes <= state.startMinutes) {
        state.endMinutes = Math.min(1440, state.startMinutes + 60);
    }
    state.isScheduled = true;
}

export function setTaskScheduleEndMinutes(state: TaskScheduleState, minutes: number): void {
    state.endMinutes = Math.max(15, Math.min(1440, minutes));
    if (state.endMinutes <= state.startMinutes) {
        state.endMinutes = Math.min(1440, state.startMinutes + 15);
    }
    state.isScheduled = true;
}

export function clearTaskSchedule(state: TaskScheduleState): void {
    state.isScheduled = false;
    state.repeatFlag = null;
}

export function taskScheduleStateToValue(state: TaskScheduleState): TaskScheduleValue {
    if (!state.isScheduled) {
        return { startDate: null, dueDate: null, isAllDay: false, repeatFlag: null };
    }

    const startDate = new Date(state.selectedDate);
    const dueDate = new Date(state.selectedDate);
    if (state.isAllDay) {
        startDate.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);
    } else {
        startDate.setHours(0, state.startMinutes, 0, 0);
        dueDate.setHours(0, state.endMinutes, 0, 0);
    }
    return { startDate, dueDate, isAllDay: state.isAllDay, repeatFlag: state.repeatFlag };
}
