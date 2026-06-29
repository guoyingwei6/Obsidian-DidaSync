export interface DatePickerModalInitialSchedule {
    startDate?: string | Date | null;
    dueDate?: string | Date | null;
    isAllDay?: boolean;
    repeatFlag?: string | null;
}

export function hasExplicitSchedule(schedule?: DatePickerModalInitialSchedule | null): boolean {
    return !!(schedule?.startDate || schedule?.dueDate);
}

export function resolveDatePickerInitialSchedule(
    task: DatePickerModalInitialSchedule | null,
    initialSchedule: DatePickerModalInitialSchedule | null
): DatePickerModalInitialSchedule | null {
    if (hasExplicitSchedule(initialSchedule)) {
        return {
            startDate: initialSchedule?.startDate ?? task?.startDate ?? null,
            dueDate: initialSchedule?.dueDate ?? task?.dueDate ?? null,
            isAllDay: initialSchedule?.isAllDay ?? task?.isAllDay,
            repeatFlag: initialSchedule?.repeatFlag ?? task?.repeatFlag ?? null
        };
    }
    if (hasExplicitSchedule(task)) {
        return {
            startDate: task?.startDate ?? null,
            dueDate: task?.dueDate ?? null,
            isAllDay: task?.isAllDay,
            repeatFlag: task?.repeatFlag ?? null
        };
    }
    return initialSchedule || task || null;
}
