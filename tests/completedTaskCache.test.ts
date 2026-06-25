import {
    fetchCompletedTasksByRange,
    filterCompletedTasksByQuery,
    isCompletedTaskRangeCovered,
    mergeCompletedTaskCacheSegments,
    mergeCompletedTasks
} from "../src/completedTaskCache";

function assertEqual(actual: unknown, expected: unknown, message: string) {
    if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
}

async function run() {
    const fullMonthRange = {
        startDate: new Date(2026, 5, 1, 0, 0, 0, 0),
        endDate: new Date(2026, 5, 30, 23, 59, 59, 999)
    };

    assertEqual(
        isCompletedTaskRangeCovered(fullMonthRange, [
            {
                startDate: new Date(2026, 5, 1, 0, 0, 0, 0).toISOString(),
                endDate: new Date(2026, 5, 10, 23, 59, 59, 999).toISOString(),
                fetchedAt: new Date(2026, 5, 20).toISOString(),
                complete: true
            },
            {
                startDate: new Date(2026, 5, 11, 0, 0, 0, 0).toISOString(),
                endDate: new Date(2026, 5, 30, 23, 59, 59, 999).toISOString(),
                fetchedAt: new Date(2026, 5, 20).toISOString(),
                complete: true
            }
        ]),
        true,
        "adjacent complete segments should cover the month"
    );

    assertEqual(
        isCompletedTaskRangeCovered(fullMonthRange, [
            {
                startDate: new Date(2026, 5, 1, 0, 0, 0, 0).toISOString(),
                endDate: new Date(2026, 5, 10, 23, 59, 59, 999).toISOString(),
                fetchedAt: new Date(2026, 5, 20).toISOString(),
                complete: true,
                projectIds: ["p1"]
            },
            {
                startDate: new Date(2026, 5, 11, 0, 0, 0, 0).toISOString(),
                endDate: new Date(2026, 5, 30, 23, 59, 59, 999).toISOString(),
                fetchedAt: new Date(2026, 5, 20).toISOString(),
                complete: true,
                projectIds: ["p1"]
            }
        ]),
        false,
        "project-scoped segments should not cover unfiltered queries"
    );

    const mergedSegments = mergeCompletedTaskCacheSegments([
        {
            startDate: new Date(2026, 5, 1, 0, 0, 0, 0).toISOString(),
            endDate: new Date(2026, 5, 15, 23, 59, 59, 999).toISOString(),
            fetchedAt: "2026-06-20T00:00:00.000Z",
            complete: true
        },
        {
            startDate: new Date(2026, 5, 16, 0, 0, 0, 0).toISOString(),
            endDate: new Date(2026, 5, 30, 23, 59, 59, 999).toISOString(),
            fetchedAt: "2026-06-20T00:00:00.000Z",
            complete: true
        }
    ]);
    assertEqual(mergedSegments.length, 1, "adjacent segments with same scope and status should merge");

    const mergedTasks = mergeCompletedTasks(
        [{ id: "1", didaId: "remote-1", title: "old", content: "", status: 2, projectId: "inbox" }],
        [{ id: "2", didaId: "remote-1", title: "new", content: "", status: 2, projectId: "inbox" }]
    );
    assertDeepEqual(mergedTasks.map((task) => task.title), ["new"], "incoming tasks should overwrite existing duplicates");

    const filteredTasks = filterCompletedTasksByQuery([
        { id: "1", didaId: "a", title: "Alpha", content: "", desc: "", status: 2, projectId: "p1", completedTime: "2026-06-10T10:00:00.000Z" },
        { id: "2", didaId: "b", title: "Beta", content: "", desc: "", status: 2, projectId: "p2", completedTime: "2026-06-20T10:00:00.000Z" }
    ], {
        projectIds: ["p2"],
        startDate: "2026-06-15T00:00:00.000Z",
        endDate: "2026-06-25T23:59:59.999Z"
    });
    assertDeepEqual(filteredTasks.map((task) => task.title), ["Beta"], "query filters should respect project and date");

    const fetchCalls: Array<{ startDate: string; endDate: string }> = [];
    const recursiveResult = await fetchCompletedTasksByRange(
        fullMonthRange,
        async (query) => {
            fetchCalls.push({ startDate: query.startDate, endDate: query.endDate });
            const start = new Date(query.startDate).getTime();
            const end = new Date(query.endDate).getTime();
            const isFullMonth = start === fullMonthRange.startDate.getTime() && end === fullMonthRange.endDate.getTime();
            const isFirstHalf = end <= new Date(2026, 5, 15, 23, 59, 59, 999).getTime();
            if (isFullMonth) {
                return Array.from({ length: 200 }, (_, index) => ({
                    id: `full-${index}`,
                    didaId: `full-${index}`,
                    title: `full-${index}`,
                    content: "",
                    status: 2,
                    projectId: "inbox"
                }));
            }
            if (isFirstHalf) {
                return [{
                    id: "left",
                    didaId: "left",
                    title: "left",
                    content: "",
                    status: 2,
                    projectId: "inbox"
                }];
            }
            return [{
                id: "right",
                didaId: "right",
                title: "right",
                content: "",
                status: 2,
                projectId: "inbox"
            }];
        },
        { fetchedAt: "2026-06-20T00:00:00.000Z" }
    );

    assertEqual(fetchCalls.length, 3, "hitting the 200 cap should recursively split the range");
    assertDeepEqual(
        recursiveResult.tasks.map((task) => task.title).sort(),
        ["left", "right"],
        "recursive fetch should return the subdivided results"
    );
    assertEqual(recursiveResult.truncatedSegments.length, 0, "subdivided month should not be marked truncated");

    const singleDayRange = {
        startDate: new Date(2026, 5, 12, 0, 0, 0, 0),
        endDate: new Date(2026, 5, 12, 23, 59, 59, 999)
    };
    const singleDayResult = await fetchCompletedTasksByRange(
        singleDayRange,
        async () => Array.from({ length: 200 }, (_, index) => ({
            id: `day-${index}`,
            didaId: `day-${index}`,
            title: `day-${index}`,
            content: "",
            status: 2,
            projectId: "inbox"
        })),
        { fetchedAt: "2026-06-20T00:00:00.000Z" }
    );
    assertEqual(singleDayResult.truncatedSegments.length, 1, "single-day overflow should remain marked as truncated");

    console.log("completedTaskCache tests passed");
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
