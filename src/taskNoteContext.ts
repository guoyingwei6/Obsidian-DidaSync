import { getTaskNoteWeekRange, getTaskNoteWeekStem, TaskNoteSyncRangeType } from "./taskNotePath";

export interface TaskNoteResolvedContext {
    rangeType: TaskNoteSyncRangeType;
    baseDate: string;
    startDate: string;
    endDate: string;
}

export function resolveTaskNoteContextFromFrontmatter(frontmatter: any): TaskNoteResolvedContext | null {
    const rangeType = normalizeRangeType(frontmatter?.didaSyncRangeType);
    const startDate = normalizeDateString(frontmatter?.didaSyncStartDate);
    const endDate = normalizeDateString(frontmatter?.didaSyncEndDate);
    if (!rangeType || !startDate || !endDate) return null;
    return {
        rangeType,
        baseDate: getBaseDateForRange(rangeType, startDate),
        startDate,
        endDate
    };
}

export function resolveTaskNoteContextFromTitle(
    title: string,
    weekStart: "monday" | "sunday"
): TaskNoteResolvedContext | null {
    const normalizedTitle = (title || "").trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedTitle)) {
        return {
            rangeType: "day",
            baseDate: normalizedTitle,
            startDate: normalizedTitle,
            endDate: normalizedTitle
        };
    }

    const weekMatch = normalizedTitle.match(/^(\d{4})-W(\d{2})$/);
    if (weekMatch) {
        const year = Number(weekMatch[1]);
        const week = Number(weekMatch[2]);
        const startDate = resolveWeekStartFromStem(year, week, weekStart);
        if (!startDate) return null;
        const range = getTaskNoteWeekRange(startDate, weekStart);
        return {
            rangeType: "week",
            baseDate: range.startDate,
            startDate: range.startDate,
            endDate: range.endDate
        };
    }

    if (/^\d{4}-\d{2}$/.test(normalizedTitle)) {
        const baseDate = `${normalizedTitle}-01`;
        const [year, month] = normalizedTitle.split("-").map(Number);
        const endDate = new Date(year, month, 0);
        return {
            rangeType: "month",
            baseDate,
            startDate: baseDate,
            endDate: formatDateOnly(endDate)
        };
    }

    if (/^\d{4}$/.test(normalizedTitle)) {
        return {
            rangeType: "year",
            baseDate: `${normalizedTitle}-01-01`,
            startDate: `${normalizedTitle}-01-01`,
            endDate: `${normalizedTitle}-12-31`
        };
    }

    const customMatch = normalizedTitle.match(/^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/);
    if (customMatch) {
        return {
            rangeType: "custom",
            baseDate: customMatch[1],
            startDate: customMatch[1],
            endDate: customMatch[2]
        };
    }

    return null;
}

export function resolveTaskNoteContextFromLegacyDate(rawDate: unknown): TaskNoteResolvedContext | null {
    if (!rawDate) return null;
    const date = new Date(String(rawDate));
    if (isNaN(date.getTime())) return null;
    const dateOnly = formatDateOnly(date);
    return {
        rangeType: "day",
        baseDate: dateOnly,
        startDate: dateOnly,
        endDate: dateOnly
    };
}

export function resolveTaskNoteContextFromLegacyFileName(basename: string): TaskNoteResolvedContext | null {
    const match = basename.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;
    return {
        rangeType: "day",
        baseDate: match[1],
        startDate: match[1],
        endDate: match[1]
    };
}

export function getBaseDateForRange(type: TaskNoteSyncRangeType, startDate: string): string {
    if (type === "custom") return startDate;
    if (type === "year") return `${startDate.slice(0, 4)}-01-01`;
    if (type === "month") return `${startDate.slice(0, 7)}-01`;
    return startDate;
}

export function normalizeRangeType(value: unknown): TaskNoteSyncRangeType | null {
    return typeof value === "string" && ["day", "week", "month", "year", "custom"].includes(value)
        ? value as TaskNoteSyncRangeType
        : null;
}

export function normalizeDateString(value: unknown): string | null {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

export function resolveWeekStartFromStem(
    year: number,
    week: number,
    weekStart: "monday" | "sunday"
): string | null {
    if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return null;
    const searchStart = new Date(year - 1, 11, 20);
    const searchEnd = new Date(year + 1, 0, 15);
    const cursor = new Date(searchStart);
    while (cursor <= searchEnd) {
        const candidate = formatDateOnly(cursor);
        const stem = getTaskNoteWeekStem(candidate, weekStart);
        if (stem === `${year}-W${String(week).padStart(2, "0")}`) {
            return getTaskNoteWeekRange(candidate, weekStart).startDate;
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return null;
}

function formatDateOnly(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
