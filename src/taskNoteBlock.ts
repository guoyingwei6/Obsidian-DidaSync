import { TaskNoteSyncRangeType } from "./taskNotePath";

export const DIDASYNC_BLOCK_START_MARKER = "<!-- didasync:start -->";
export const DIDASYNC_BLOCK_END_MARKER = "<!-- didasync:end -->";

export interface DidaSyncBlockConfig {
    range: string;
    projects: string[];
}

export interface DidaSyncBlockRange {
    type: TaskNoteSyncRangeType;
    startDate: string;
    endDate: string;
}

export interface ParsedDidaSyncBlock {
    lineIndex: number;
    config: DidaSyncBlockConfig;
    range: DidaSyncBlockRange;
    projectKeys: string[];
    startMarkerIndex: number;
    endMarkerIndex: number;
    insertIndex: number;
    error?: string;
}

export function parseDidaSyncBlocks(lines: string[]): ParsedDidaSyncBlock[] {
    const blocks: ParsedDidaSyncBlock[] = [];
    for (let i = 0; i < lines.length; i++) {
        const configText = extractDidaSyncConfigText(lines[i]);
        if (configText === null) continue;

        const parsed = parseDidaSyncBlockConfig(configText);
        const markerRange = findManagedMarkerRange(lines, i);
        blocks.push({
            lineIndex: i,
            config: parsed.config,
            range: parsed.range,
            projectKeys: parsed.projectKeys,
            startMarkerIndex: markerRange.startMarkerIndex,
            endMarkerIndex: markerRange.endMarkerIndex,
            insertIndex: markerRange.insertIndex,
            error: parsed.error
        });
    }
    return blocks;
}

export function replaceDidaSyncBlockContent(
    lines: string[],
    block: ParsedDidaSyncBlock,
    generatedLines: string[]
): string[] {
    const replacement = [
        quoteCalloutLine(DIDASYNC_BLOCK_START_MARKER),
        ...generatedLines,
        quoteCalloutLine(DIDASYNC_BLOCK_END_MARKER)
    ];

    if (block.startMarkerIndex !== -1 && block.endMarkerIndex !== -1 && block.endMarkerIndex >= block.startMarkerIndex) {
        return [
            ...lines.slice(0, block.startMarkerIndex),
            ...replacement,
            ...lines.slice(block.endMarkerIndex + 1)
        ];
    }

    return [
        ...lines.slice(0, block.insertIndex),
        ...replacement,
        ...lines.slice(block.insertIndex)
    ];
}

export function extractDidaSyncConfigText(line: string): string | null {
    const match = line.match(/^>\s*\[!didasync\]\s*(.*)$/);
    if (!match) return null;
    const configText = (match[1] || "").trim();
    return configText || "{}";
}

export function parseDidaSyncBlockConfig(configText: string): {
    config: DidaSyncBlockConfig;
    range: DidaSyncBlockRange;
    projectKeys: string[];
    error?: string;
} {
    let raw: any;
    try {
        raw = JSON.parse(configText);
    } catch {
        return invalidConfig("Invalid didasync JSON");
    }

    const rangeText = typeof raw?.range === "string" ? raw.range.trim() : "";
    const range = parseDidaSyncRange(rangeText);
    if (!range) return invalidConfig("Invalid didasync range");

    const projects = Array.isArray(raw?.projects)
        ? raw.projects.filter((project: unknown): project is string => typeof project === "string" && project.trim() !== "").map((project: string) => normalizeProjectKey(project))
        : [];

    return {
        config: {
            range: rangeText,
            projects
        },
        range,
        projectKeys: projects
    };
}

export function parseDidaSyncRange(value: string): DidaSyncBlockRange | null {
    const trimmed = (value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && isValidDateOnly(trimmed)) {
        return { type: "day", startDate: trimmed, endDate: trimmed };
    }

    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})$/);
    if (!match) return null;

    const start = match[1];
    const end = match[2];
    if (!isValidDateOnly(start) || !isValidDateOnly(end)) return null;
    return start <= end
        ? { type: "custom", startDate: start, endDate: end }
        : { type: "custom", startDate: end, endDate: start };
}

export function quoteCalloutLine(content: string): string {
    return content ? `> ${content}` : ">";
}

function findManagedMarkerRange(lines: string[], configLineIndex: number): {
    startMarkerIndex: number;
    endMarkerIndex: number;
    insertIndex: number;
} {
    const blockEnd = findDidaSyncCalloutEnd(lines, configLineIndex);
    let startMarkerIndex = -1;
    let endMarkerIndex = -1;

    for (let i = configLineIndex + 1; i < blockEnd; i++) {
        const content = unquoteCalloutLine(lines[i]).trim();
        if (content === DIDASYNC_BLOCK_START_MARKER) startMarkerIndex = i;
        if (content === DIDASYNC_BLOCK_END_MARKER) {
            endMarkerIndex = i;
            break;
        }
    }

    return {
        startMarkerIndex,
        endMarkerIndex,
        insertIndex: configLineIndex + 1
    };
}

function findDidaSyncCalloutEnd(lines: string[], configLineIndex: number): number {
    for (let i = configLineIndex + 1; i < lines.length; i++) {
        if (extractDidaSyncConfigText(lines[i]) !== null) return i;
        if (!lines[i].trim().startsWith(">")) return i;
    }
    return lines.length;
}

function unquoteCalloutLine(line: string): string {
    return line.replace(/^>\s?/, "");
}

function normalizeProjectKey(project: string): string {
    const trimmed = project.trim();
    return /^(id|name):/.test(trimmed) ? trimmed : `name:${trimmed}`;
}

function isValidDateOnly(value: string): boolean {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function invalidConfig(error: string): {
    config: DidaSyncBlockConfig;
    range: DidaSyncBlockRange;
    projectKeys: string[];
    error: string;
} {
    return {
        config: { range: "", projects: [] },
        range: { type: "custom", startDate: "1970-01-01", endDate: "1970-01-01" },
        projectKeys: [],
        error
    };
}
