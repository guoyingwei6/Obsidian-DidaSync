import { CompletedTaskCacheSegment, DidaTask } from "./types";

const COMPLETED_TASK_FETCH_LIMIT = 200;

export interface CompletedTaskRange {
    startDate: Date;
    endDate: Date;
}

export interface CompletedTaskFetchResult<TTask = DidaTask> {
    tasks: TTask[];
    segments: CompletedTaskCacheSegment[];
    truncatedSegments: CompletedTaskCacheSegment[];
}

export function normalizeCompletedTaskProjectIds(projectIds?: string[]) {
    if (!Array.isArray(projectIds) || projectIds.length === 0) return undefined;
    const values = Array.from(new Set(projectIds
        .map((value) => String(value || "").trim())
        .filter(Boolean)));
    values.sort();
    return values.length > 0 ? values : undefined;
}

export function normalizeCompletedTaskCacheSegments(segments: unknown): CompletedTaskCacheSegment[] {
    if (!Array.isArray(segments)) return [];
    return segments
        .map((segment) => {
            if (!segment || typeof segment !== "object") return null;
            const startDate = String((segment as any).startDate || "");
            const endDate = String((segment as any).endDate || "");
            const fetchedAt = String((segment as any).fetchedAt || "");
            const complete = (segment as any).complete === true;
            if (!isValidDateString(startDate) || !isValidDateString(endDate) || !isValidDateString(fetchedAt)) return null;
            const normalizedProjectIds = normalizeCompletedTaskProjectIds((segment as any).projectIds);
            if (new Date(startDate).getTime() > new Date(endDate).getTime()) return null;
            return {
                projectIds: normalizedProjectIds,
                startDate,
                endDate,
                fetchedAt,
                complete
            } satisfies CompletedTaskCacheSegment;
        })
        .filter((segment): segment is CompletedTaskCacheSegment => !!segment);
}

export function isCompletedTaskRangeCovered(
    range: CompletedTaskRange,
    segments: CompletedTaskCacheSegment[] | undefined,
    projectIds?: string[]
) {
    const normalizedSegments = normalizeCompletedTaskCacheSegments(segments);
    const targetProjectIds = normalizeCompletedTaskProjectIds(projectIds);
    const intervals = normalizedSegments
        .filter((segment) => segment.complete && projectScopeEquals(segment.projectIds, targetProjectIds))
        .map((segment) => ({
            start: new Date(segment.startDate).getTime(),
            end: new Date(segment.endDate).getTime()
        }))
        .filter((segment) => !Number.isNaN(segment.start) && !Number.isNaN(segment.end))
        .sort((a, b) => a.start - b.start);

    const targetStart = range.startDate.getTime();
    const targetEnd = range.endDate.getTime();
    if (Number.isNaN(targetStart) || Number.isNaN(targetEnd)) return false;

    let coveredUntil = targetStart;
    for (const interval of intervals) {
        if (interval.end < coveredUntil) continue;
        if (interval.start > coveredUntil) return false;
        coveredUntil = Math.max(coveredUntil, interval.end + 1);
        if (coveredUntil > targetEnd) return true;
    }

    return coveredUntil > targetEnd;
}

export function buildCompletedTaskCacheSegment(
    range: CompletedTaskRange,
    fetchedAt: string,
    complete: boolean,
    projectIds?: string[]
): CompletedTaskCacheSegment {
    return {
        projectIds: normalizeCompletedTaskProjectIds(projectIds),
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
        fetchedAt,
        complete
    };
}

export function mergeCompletedTaskCacheSegments(segments: CompletedTaskCacheSegment[]) {
    const normalized = normalizeCompletedTaskCacheSegments(segments)
        .sort((a, b) => {
            const scopeCompare = projectScopeKey(a.projectIds).localeCompare(projectScopeKey(b.projectIds));
            if (scopeCompare !== 0) return scopeCompare;
            return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        });

    const merged: CompletedTaskCacheSegment[] = [];
    for (const segment of normalized) {
        const previous = merged[merged.length - 1];
        if (
            previous &&
            previous.complete === segment.complete &&
            previous.fetchedAt === segment.fetchedAt &&
            projectScopeEquals(previous.projectIds, segment.projectIds) &&
            new Date(segment.startDate).getTime() <= new Date(previous.endDate).getTime() + 1
        ) {
            if (new Date(segment.endDate).getTime() > new Date(previous.endDate).getTime()) {
                previous.endDate = segment.endDate;
            }
            continue;
        }
        merged.push({ ...segment, projectIds: segment.projectIds ? [...segment.projectIds] : undefined });
    }

    return merged;
}

export function mergeCompletedTasks(tasks: DidaTask[], incoming: DidaTask[]) {
    const byId = new Map<string, DidaTask>();
    const put = (task: DidaTask) => {
        const key = String(task.didaId || task.id || "").trim();
        if (!key) return;
        byId.set(key, task);
    };
    tasks.forEach(put);
    incoming.forEach(put);
    return Array.from(byId.values());
}

export function filterCompletedTasksByQuery(tasks: DidaTask[], query: { projectIds?: string[]; startDate?: string; endDate?: string }) {
    const normalizedProjectIds = normalizeCompletedTaskProjectIds(query.projectIds);
    const startTime = query.startDate ? new Date(query.startDate).getTime() : null;
    const endTime = query.endDate ? new Date(query.endDate).getTime() : null;

    return tasks.filter((task) => {
        if (normalizedProjectIds && !normalizedProjectIds.includes(String(task.projectId || ""))) return false;
        if (startTime === null && endTime === null) return true;
        const completedTime = task.completedTime ? new Date(task.completedTime).getTime() : NaN;
        if (Number.isNaN(completedTime)) return false;
        if (startTime !== null && completedTime < startTime) return false;
        if (endTime !== null && completedTime > endTime) return false;
        return true;
    });
}

export function getMonthlyCompletedTaskRanges(range: CompletedTaskRange) {
    const ranges: CompletedTaskRange[] = [];
    const cursor = new Date(range.startDate);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= range.endDate.getTime()) {
        const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0, 0);
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
        ranges.push({
            startDate: new Date(Math.max(monthStart.getTime(), range.startDate.getTime())),
            endDate: new Date(Math.min(monthEnd.getTime(), range.endDate.getTime()))
        });
        cursor.setMonth(cursor.getMonth() + 1, 1);
        cursor.setHours(0, 0, 0, 0);
    }
    return ranges;
}

export async function fetchCompletedTasksByRange<TTask>(
    range: CompletedTaskRange,
    fetcher: (query: { projectIds?: string[]; startDate: string; endDate: string }) => Promise<TTask[]>,
    options: { projectIds?: string[]; fetchedAt?: string } = {}
): Promise<CompletedTaskFetchResult<TTask>> {
    const fetchedAt = options.fetchedAt || new Date().toISOString();
    const normalizedProjectIds = normalizeCompletedTaskProjectIds(options.projectIds);
    const response = await fetcher({
        projectIds: normalizedProjectIds,
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString()
    });
    const tasks = Array.isArray(response) ? response : [];
    if (tasks.length < COMPLETED_TASK_FETCH_LIMIT) {
        return {
            tasks,
            segments: [buildCompletedTaskCacheSegment(range, fetchedAt, true, normalizedProjectIds)],
            truncatedSegments: []
        };
    }

    if (isSameCalendarDay(range.startDate, range.endDate)) {
        const incompleteSegment = buildCompletedTaskCacheSegment(range, fetchedAt, false, normalizedProjectIds);
        return {
            tasks,
            segments: [incompleteSegment],
            truncatedSegments: [incompleteSegment]
        };
    }

    const split = splitCompletedTaskRange(range);
    if (!split) {
        const incompleteSegment = buildCompletedTaskCacheSegment(range, fetchedAt, false, normalizedProjectIds);
        return {
            tasks,
            segments: [incompleteSegment],
            truncatedSegments: [incompleteSegment]
        };
    }

    const [left, right] = await Promise.all([
        fetchCompletedTasksByRange(split.left, fetcher, { projectIds: normalizedProjectIds, fetchedAt }),
        fetchCompletedTasksByRange(split.right, fetcher, { projectIds: normalizedProjectIds, fetchedAt })
    ]);

    return {
        tasks: [...left.tasks, ...right.tasks],
        segments: [...left.segments, ...right.segments],
        truncatedSegments: [...left.truncatedSegments, ...right.truncatedSegments]
    };
}

function splitCompletedTaskRange(range: CompletedTaskRange) {
    const start = range.startDate.getTime();
    const end = range.endDate.getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null;
    const midpoint = Math.floor((start + end) / 2);
    if (midpoint <= start || midpoint >= end) return null;
    return {
        left: {
            startDate: new Date(start),
            endDate: new Date(midpoint)
        },
        right: {
            startDate: new Date(midpoint + 1),
            endDate: new Date(end)
        }
    };
}

function projectScopeEquals(left?: string[], right?: string[]) {
    const normalizedLeft = normalizeCompletedTaskProjectIds(left);
    const normalizedRight = normalizeCompletedTaskProjectIds(right);
    if (!normalizedLeft && !normalizedRight) return true;
    if (!normalizedLeft || !normalizedRight || normalizedLeft.length !== normalizedRight.length) return false;
    return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function projectScopeKey(projectIds?: string[]) {
    const normalized = normalizeCompletedTaskProjectIds(projectIds);
    return normalized ? normalized.join("|") : "*";
}

function isSameCalendarDay(left: Date, right: Date) {
    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}

function isValidDateString(value: string) {
    return !!value && !Number.isNaN(new Date(value).getTime());
}
