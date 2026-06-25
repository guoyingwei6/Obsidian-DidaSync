import { CompletedTasksQuery } from "./types";

export interface CalendarCompletedRange {
    startDate: Date;
    endDate: Date;
    key: string;
}

export interface CalendarCompletedFetchDecisionInput {
    showCompletedInCalendar: boolean;
    calendarCompletedLoading: boolean;
    accessToken?: string;
    range: CalendarCompletedRange;
    calendarCompletedRangeKey: string;
    calendarCompletedError: string;
    completedTasksQuery?: CompletedTasksQuery;
    completedTasksLastFetchedAt?: string;
}

export interface CalendarCompletedFetchDecision {
    shouldFetch: boolean;
    shouldMarkRangeKey: boolean;
}

export function hasCalendarCompletedCacheForRange(
    range: Pick<CalendarCompletedRange, "startDate" | "endDate">,
    completedTasksQuery?: CompletedTasksQuery,
    completedTasksLastFetchedAt?: string
) {
    if (!completedTasksQuery?.startDate || !completedTasksQuery?.endDate || !completedTasksLastFetchedAt) return false;

    const cachedStart = new Date(completedTasksQuery.startDate);
    const cachedEnd = new Date(completedTasksQuery.endDate);
    if (Number.isNaN(cachedStart.getTime()) || Number.isNaN(cachedEnd.getTime())) return false;

    return cachedStart.getTime() <= range.startDate.getTime() && cachedEnd.getTime() >= range.endDate.getTime();
}

export function getCalendarCompletedFetchDecision(input: CalendarCompletedFetchDecisionInput): CalendarCompletedFetchDecision {
    if (!input.showCompletedInCalendar || input.calendarCompletedLoading || !input.accessToken) {
        return { shouldFetch: false, shouldMarkRangeKey: false };
    }

    if (input.calendarCompletedRangeKey === input.range.key && !input.calendarCompletedError) {
        return { shouldFetch: false, shouldMarkRangeKey: false };
    }

    if (hasCalendarCompletedCacheForRange(input.range, input.completedTasksQuery, input.completedTasksLastFetchedAt)) {
        return { shouldFetch: false, shouldMarkRangeKey: true };
    }

    return { shouldFetch: true, shouldMarkRangeKey: false };
}
