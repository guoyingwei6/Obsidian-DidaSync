import { isCompletedTaskRangeCovered } from "./completedTaskCache";
import { CompletedTaskCacheSegment } from "./types";

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
    completedTaskCacheSegments?: CompletedTaskCacheSegment[];
}

export interface CalendarCompletedFetchDecision {
    shouldFetch: boolean;
    shouldMarkRangeKey: boolean;
}

export function hasCalendarCompletedCacheForRange(
    range: Pick<CalendarCompletedRange, "startDate" | "endDate">,
    completedTaskCacheSegments?: CompletedTaskCacheSegment[]
) {
    return isCompletedTaskRangeCovered(range, completedTaskCacheSegments);
}

export function getCalendarCompletedFetchDecision(input: CalendarCompletedFetchDecisionInput): CalendarCompletedFetchDecision {
    if (!input.showCompletedInCalendar || input.calendarCompletedLoading || !input.accessToken) {
        return { shouldFetch: false, shouldMarkRangeKey: false };
    }

    if (input.calendarCompletedRangeKey === input.range.key && !input.calendarCompletedError) {
        return { shouldFetch: false, shouldMarkRangeKey: false };
    }

    if (hasCalendarCompletedCacheForRange(input.range, input.completedTaskCacheSegments)) {
        return { shouldFetch: false, shouldMarkRangeKey: true };
    }

    return { shouldFetch: true, shouldMarkRangeKey: false };
}
