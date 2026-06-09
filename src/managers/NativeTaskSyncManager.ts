import DidaSyncPlugin from "../main";
import { parseTaskLine } from "../taskLineFormat";

export interface NativeTask {
    id: string;
    title: string;
    isCompleted: boolean;
    didaId: string | null;
    filePath: string;
    lineNumber: number;
    originalLine: string;
    indent: string;
    hasLink: boolean;
    taskDate: string | null;
    startDate: string | null;
    dueDate: string | null;
    isAllDay: boolean;
    priority: number;
    repeatFlag: string | null;
}

export class NativeTaskSyncManager {
    plugin: DidaSyncPlugin;
    taskRegex: RegExp;
    isOnline: boolean;

    constructor(plugin: DidaSyncPlugin) {
        this.plugin = plugin;
        this.taskRegex = /^(\s*)-\s*\[([ x])\]\s*(.+?)(\s*\[🔗Dida\]\(obsidian:\/\/dida-task\?didaId=([a-zA-Z0-9]+)\))?$/gm;
        this.isOnline = navigator.onLine;
        this.setupNetworkListeners();
    }

    setupNetworkListeners() {
        window.addEventListener("online", () => {
            this.isOnline = true;
        });
        window.addEventListener("offline", () => {
            this.isOnline = false;
        });
    }

    checkNetworkConnection(): boolean {
        return this.isOnline;
    }

    getNetworkStatus(): boolean {
        return this.isOnline;
    }

    detectNativeTasks(content: string, filePath: string): NativeTask[] {
        var tasks: NativeTask[] = [],
            lines = content.split("\n");
        let inCodeBlock = false,
            codeBlockLang = "";
        
        for (let i = 0; i < lines.length; i++) {
            var line = lines[i],
                codeBlockMatch = line.match(/^(\s*)```(\w*)/);
            
            if (codeBlockMatch) {
                if (inCodeBlock) {
                    inCodeBlock = false;
                    codeBlockLang = "";
                } else {
                    inCodeBlock = true;
                    codeBlockLang = codeBlockMatch[2] || "unknown";
                }
            } else if (!inCodeBlock) {
                if (line.includes("`")) {
                    let inlineCodeMatch = line.match(/^(\s*)-\s*\[([ x])\]\s*(.+)$/);
                    if (inlineCodeMatch && inlineCodeMatch[3].match(/^`[^`]*`$/)) continue;
                }
                
                const parsed = parseTaskLine(line);
                if (parsed) {
                    const taskDate = parsed.dueDate ? parsed.dueDate.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || null : null;
                    if (parsed.title && parsed.title.length !== 0) {
                        var id = this.generateTaskId(filePath, i, parsed.title);
                        tasks.push({
                            id: id,
                            title: parsed.title,
                            isCompleted: parsed.checkbox === "x",
                            didaId: parsed.didaId,
                            filePath: filePath,
                            lineNumber: i,
                            originalLine: line,
                            indent: parsed.indent,
                            hasLink: !!parsed.didaId,
                            taskDate: taskDate,
                            startDate: parsed.startDate,
                            dueDate: parsed.dueDate,
                            isAllDay: parsed.isAllDay,
                            priority: parsed.priority,
                            repeatFlag: parsed.repeatFlag
                        });
                    }
                }
            }
        }
        return tasks;
    }

    generateTaskId(filePath: string, lineNumber: number, title: string): string {
        return (filePath + `:${lineNumber}:` + title).replace(/[^a-zA-Z0-9]/g, "_");
    }
}
