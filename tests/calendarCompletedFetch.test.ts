import { getCalendarCompletedFetchDecision, hasCalendarCompletedCacheForRange } from "../src/calendarCompletedFetch";
import { getCalendarMonthRange, getCalendarYearRange } from "../src/calendarMonth";

function assertEqual(actual: unknown, expected: unknown, message: string) {
    if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function buildMonthInput(overrides: Partial<Parameters<typeof getCalendarCompletedFetchDecision>[0]> = {}) {
    const monthRange = getCalendarMonthRange(new Date(2026, 5, 15));
    return {
        showCompletedInCalendar: true,
        calendarCompletedLoading: false,
        accessToken: "access-token",
        range: {
            ...monthRange,
            key: "2026-06"
        },
        calendarCompletedRangeKey: "",
        calendarCompletedError: "",
        completedTasksQuery: {},
        completedTasksLastFetchedAt: "",
        ...overrides
    };
}

const fetchWithoutCache = getCalendarCompletedFetchDecision(buildMonthInput());
assertEqual(fetchWithoutCache.shouldFetch, true, "no cache should fetch completed tasks");
assertEqual(fetchWithoutCache.shouldMarkRangeKey, false, "fetching should not mark range key early");

const fetchWithoutCacheWithOnlyPendingLocalTasks = getCalendarCompletedFetchDecision(buildMonthInput());
assertEqual(fetchWithoutCacheWithOnlyPendingLocalTasks.shouldFetch, true, "pending local tasks should not suppress completed fetch");

const fetchWithoutCacheWithLocalCompletedTasks = getCalendarCompletedFetchDecision(buildMonthInput());
assertEqual(fetchWithoutCacheWithLocalCompletedTasks.shouldFetch, true, "local completed tasks should not suppress completed fetch");

const monthRange = getCalendarMonthRange(new Date(2026, 5, 15));
assertEqual(
    hasCalendarCompletedCacheForRange(
        monthRange,
        {
            startDate: new Date(2026, 5, 1, 0, 0, 0, 0).toISOString(),
            endDate: new Date(2026, 5, 30, 23, 59, 59, 999).toISOString()
        },
        new Date(2026, 5, 20).toISOString()
    ),
    true,
    "month cache covering full visible range should be reusable"
);

const cachedMonthDecision = getCalendarCompletedFetchDecision(buildMonthInput({
    completedTasksQuery: {
        startDate: new Date(2026, 4, 25, 0, 0, 0, 0).toISOString(),
        endDate: new Date(2026, 6, 5, 23, 59, 59, 999).toISOString()
    },
    completedTasksLastFetchedAt: new Date(2026, 5, 20).toISOString()
}));
assertEqual(cachedMonthDecision.shouldFetch, false, "covered month cache should skip refetch");
assertEqual(cachedMonthDecision.shouldMarkRangeKey, true, "covered month cache should mark range key");

const partialMonthDecision = getCalendarCompletedFetchDecision(buildMonthInput({
    completedTasksQuery: {
        startDate: new Date(2026, 5, 10, 0, 0, 0, 0).toISOString(),
        endDate: new Date(2026, 5, 20, 23, 59, 59, 999).toISOString()
    },
    completedTasksLastFetchedAt: new Date(2026, 5, 20).toISOString()
}));
assertEqual(partialMonthDecision.shouldFetch, true, "partial month cache should refetch");

const staleMonthDecision = getCalendarCompletedFetchDecision(buildMonthInput({
    completedTasksQuery: {
        startDate: new Date(2026, 4, 1, 0, 0, 0, 0).toISOString(),
        endDate: new Date(2026, 4, 31, 23, 59, 59, 999).toISOString()
    },
    completedTasksLastFetchedAt: new Date(2026, 4, 31).toISOString()
}));
assertEqual(staleMonthDecision.shouldFetch, true, "old month cache should refetch");

const sameRangeDecision = getCalendarCompletedFetchDecision(buildMonthInput({
    calendarCompletedRangeKey: "2026-06"
}));
assertEqual(sameRangeDecision.shouldFetch, false, "same successful range should not refetch");

const retryAfterErrorDecision = getCalendarCompletedFetchDecision(buildMonthInput({
    calendarCompletedRangeKey: "2026-06",
    calendarCompletedError: "network failed"
}));
assertEqual(retryAfterErrorDecision.shouldFetch, true, "same range with error should allow retry");

const yearRange = getCalendarYearRange(new Date(2026, 5, 15));
const cachedYearDecision = getCalendarCompletedFetchDecision({
    showCompletedInCalendar: true,
    calendarCompletedLoading: false,
    accessToken: "access-token",
    range: {
        ...yearRange,
        key: "2026"
    },
    calendarCompletedRangeKey: "",
    calendarCompletedError: "",
    completedTasksQuery: {
        startDate: new Date(2026, 0, 1, 0, 0, 0, 0).toISOString(),
        endDate: new Date(2026, 11, 31, 23, 59, 59, 999).toISOString()
    },
    completedTasksLastFetchedAt: new Date(2026, 5, 20).toISOString()
});
assertEqual(cachedYearDecision.shouldFetch, false, "covered year cache should skip refetch");
assertEqual(cachedYearDecision.shouldMarkRangeKey, true, "covered year cache should mark range key");

console.log("calendarCompletedFetch tests passed");
