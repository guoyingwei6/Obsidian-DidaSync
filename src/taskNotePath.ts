import { endOfWeek, format, getWeek, getWeekYear, startOfWeek } from "date-fns";
import { TaskNoteSyncPathPatterns } from "./types";

export type TaskNoteSyncRangeType = "day" | "week" | "month" | "year" | "custom";

export interface TaskNoteSyncRangeLike {
    type: TaskNoteSyncRangeType;
    startDate: string;
    endDate: string;
}

export interface TaskNotePathContext {
    rootFolder: string;
    weekStart: "monday" | "sunday";
    pathPatterns?: Partial<TaskNoteSyncPathPatterns> | null;
}

export function buildTaskNoteTargetFilePath(
    range: TaskNoteSyncRangeLike,
    context: TaskNotePathContext
): string {
    const folder = normalizeTaskNotePath((context.rootFolder || "").trim());
    const relativePath = buildTaskNoteRelativePath(range, context);
    return folder ? normalizeTaskNotePath(`${folder}/${relativePath}`) : relativePath;
}

export function buildTaskNoteRelativePath(
    range: TaskNoteSyncRangeLike,
    context: Pick<TaskNotePathContext, "weekStart" | "pathPatterns">
): string {
    const pattern = getTaskNotePathPattern(range.type, context.pathPatterns);
    const relativePath = pattern
        ? renderTaskNotePathPattern(range, pattern, context.weekStart)
        : buildDefaultTaskNoteFileName(range, context.weekStart);
    return ensureMarkdownExtension(relativePath);
}

export function getTaskNotePathPattern(
    rangeType: TaskNoteSyncRangeType,
    pathPatterns?: Partial<TaskNoteSyncPathPatterns> | null
): string {
    if (rangeType === "custom") return "";
    if (!pathPatterns || typeof pathPatterns !== "object") return "";
    return (pathPatterns[rangeType] || "").trim();
}

export function renderTaskNotePathPattern(
    range: TaskNoteSyncRangeLike,
    pattern: string,
    weekStart: "monday" | "sunday"
): string {
    const anchorDate = parseDateOnly(range.startDate);
    const weekInfo = range.type === "week" ? getTaskNoteWeekInfo(range.startDate, weekStart) : null;
    const replacements = new Map<string, string>([
        ["gggg", weekInfo ? String(weekInfo.year) : ""],
        ["gg", weekInfo ? String(weekInfo.year).slice(-2) : ""],
        ["ww", weekInfo ? String(weekInfo.week).padStart(2, "0") : ""],
        ["w", weekInfo ? String(weekInfo.week) : ""],
        ["YYYY", format(anchorDate, "yyyy")],
        ["YY", format(anchorDate, "yy")],
        ["MM", format(anchorDate, "MM")],
        ["M", format(anchorDate, "M")],
        ["DD", format(anchorDate, "dd")],
        ["D", format(anchorDate, "d")]
    ]);

    const literalStore: string[] = [];
    let rendered = normalizeTaskNotePath(pattern.trim()).replace(/\[([^\]]+)\]/g, (_, literal: string) => {
        literalStore.push(literal);
        return `\u0001${literalStore.length - 1}\u0002`;
    });

    rendered = replaceTaskNotePathTokens(rendered, replacements);

    rendered = rendered.replace(/\u0001(\d+)\u0002/g, (_, index: string) => literalStore[Number(index)] || "");
    return normalizeTaskNotePath(rendered);
}

export function buildDefaultTaskNoteFileName(
    range: TaskNoteSyncRangeLike,
    weekStart: "monday" | "sunday" = "monday"
): string {
    if (range.type === "day") return `${range.startDate}.md`;
    if (range.type === "week") return `${getTaskNoteWeekStem(range.startDate, weekStart)}.md`;
    if (range.type === "month") return `${range.startDate.slice(0, 7)}.md`;
    if (range.type === "year") return `${range.startDate.slice(0, 4)}.md`;
    return `${range.startDate}_to_${range.endDate}.md`;
}

export function ensureMarkdownExtension(path: string): string {
    const trimmed = normalizeTaskNotePath((path || "").trim());
    if (!trimmed) return "Untitled.md";
    return trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
}

export function getTaskNoteWeekInfo(
    dateStr: string,
    weekStart: "monday" | "sunday"
): { year: number; week: number } {
    const date = parseDateOnly(dateStr);
    const options = getTaskNoteWeekOptions(weekStart);
    return {
        year: getWeekYear(date, options),
        week: getWeek(date, options)
    };
}

export function getTaskNoteWeekStem(
    dateStr: string,
    weekStart: "monday" | "sunday"
): string {
    const weekInfo = getTaskNoteWeekInfo(dateStr, weekStart);
    return `${weekInfo.year}-W${String(weekInfo.week).padStart(2, "0")}`;
}

export function getTaskNoteWeekRange(
    dateStr: string,
    weekStart: "monday" | "sunday"
): { startDate: string; endDate: string } {
    const date = parseDateOnly(dateStr);
    const options = getTaskNoteWeekOptions(weekStart);
    return {
        startDate: formatDateOnly(startOfWeek(date, options)),
        endDate: formatDateOnly(endOfWeek(date, options))
    };
}

export function getTaskNoteWeekOptions(weekStart: "monday" | "sunday"): { weekStartsOn: 0 | 1; firstWeekContainsDate: 1 | 4 } {
    return weekStart === "sunday"
        ? { weekStartsOn: 0, firstWeekContainsDate: 1 }
        : { weekStartsOn: 1, firstWeekContainsDate: 4 };
}

export function parseDateOnly(dateStr: string): Date {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function formatDateOnly(date: Date): string {
    return format(date, "yyyy-MM-dd");
}

function normalizeTaskNotePath(value: string): string {
    return (value || "")
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/")
        .replace(/^\.\//, "")
        .trim();
}

function replaceTaskNotePathTokens(input: string, replacements: Map<string, string>): string {
    const tokens = ["gggg", "YYYY", "ww", "MM", "DD", "gg", "YY", "M", "D", "w"];
    let result = "";

    for (let index = 0; index < input.length;) {
        const token = tokens.find((candidate) =>
            input.startsWith(candidate, index) && isTaskNoteTokenBoundary(input, index, candidate, tokens)
        );
        if (!token) {
            result += input[index];
            index += 1;
            continue;
        }
        result += replacements.get(token) || "";
        index += token.length;
    }

    return result;
}

function isTaskNoteTokenBoundary(input: string, start: number, token: string, tokens: string[]): boolean {
    const end = start + token.length;
    const prevChar = start > 0 ? input[start - 1] : "";
    const nextChar = end < input.length ? input[end] : "";

    const prevBlocked = isAsciiLetter(prevChar) && !tokens.some((candidate) => {
        const candidateStart = start - candidate.length;
        return candidateStart >= 0 && input.startsWith(candidate, candidateStart);
    });
    if (prevBlocked) return false;

    const nextBlocked = isAsciiLetter(nextChar) && !tokens.some((candidate) => input.startsWith(candidate, end));
    return !nextBlocked;
}

function isAsciiLetter(char: string): boolean {
    return /^[A-Za-z]$/.test(char);
}
