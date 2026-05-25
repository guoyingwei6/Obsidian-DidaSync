import * as crypto from "crypto";
import * as http from "http";
import { Notice } from "obsidian";
import DidaSyncPlugin from "../main";
import { DidaProject, DidaTask } from "../types";

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
    jsonrpc?: string;
    id?: JsonRpcId;
    method?: string;
    params?: any;
};

type ToolDefinition = {
    name: string;
    description: string;
    inputSchema: any;
    readOnly?: boolean;
};

export class McpServerManager {
    private plugin: DidaSyncPlugin;
    private server: http.Server | null = null;
    private recentCreateRequests = new Map<string, DidaTask>();

    constructor(plugin: DidaSyncPlugin) {
        this.plugin = plugin;
    }

    isRunning(): boolean {
        return !!this.server;
    }

    async start() {
        if (!this.plugin.settings.enableMcpServer) return;
        if (!this.plugin.settings.mcpToken) {
            this.plugin.settings.mcpToken = this.generateToken();
            await this.plugin.saveSettings();
        }
        await this.stop();

        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res).catch((e) => {
                this.writeJson(res, 500, this.errorResponse(null, -32603, e?.message || "Internal error"));
            });
        });

        await new Promise<void>((resolve, reject) => {
            if (!this.server) return reject(new Error("MCP server not initialized"));
            this.server.once("error", reject);
            this.server.listen(this.plugin.settings.mcpPort, "127.0.0.1", () => {
                this.server?.off("error", reject);
                resolve();
            });
        });
    }

    async stop() {
        if (!this.server) return;
        const server = this.server;
        this.server = null;
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    async restart() {
        await this.stop();
        await this.start();
    }

    generateToken(): string {
        return crypto.randomBytes(24).toString("hex");
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        this.setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        if (!this.isMcpPath(req.url || "")) {
            this.writeJson(res, 404, { error: "Not found" });
            return;
        }
        if (req.method === "GET") {
            if (!this.isAuthorized(req)) {
                this.writeJson(res, 401, this.errorResponse(null, -32001, "Unauthorized MCP request"));
                return;
            }
            this.openSseStream(req, res);
            return;
        }
        if (req.method === "DELETE") {
            this.writeJson(res, 405, { error: "Method not allowed" });
            return;
        }
        if (req.method !== "POST") {
            this.writeJson(res, 405, { error: "Method not allowed" });
            return;
        }

        const raw = await this.readBody(req);
        let body: JsonRpcRequest | JsonRpcRequest[];
        try {
            body = JSON.parse(raw || "{}");
        } catch (e) {
            this.writeJson(res, 400, this.errorResponse(null, -32700, "Parse error"));
            return;
        }

        if (!this.isAuthorized(req)) {
            const id = Array.isArray(body) ? null : body.id ?? null;
            this.writeJson(res, 401, this.errorResponse(id, -32001, "Unauthorized MCP request"));
            return;
        }

        if (Array.isArray(body)) {
            const results = [];
            for (const request of body) {
                const result = await this.handleJsonRpc(request);
                if (result) results.push(result);
            }
            this.writeJson(res, 200, results);
            return;
        }

        const result = await this.handleJsonRpc(body);
        if (!result) {
            res.writeHead(202);
            res.end();
            return;
        }
        this.writeJson(res, 200, result);
    }

    private async handleJsonRpc(request: JsonRpcRequest) {
        const id = request.id ?? null;
        if (!request.id && request.method?.startsWith("notifications/")) return null;

        try {
            switch (request.method) {
                case "initialize":
                    return this.successResponse(id, {
                        protocolVersion: request.params?.protocolVersion || "2025-06-18",
                        capabilities: { tools: {} },
                        serverInfo: { name: "obsidian-didasync", version: "1.0.0" }
                    });
                case "ping":
                    return this.successResponse(id, {});
                case "tools/list":
                    return this.successResponse(id, { tools: this.getTools().map(({ readOnly, ...tool }) => tool) });
                case "tools/call":
                    return this.successResponse(id, await this.callTool(request.params?.name, request.params?.arguments || {}));
                default:
                    return this.errorResponse(id, -32601, `Method not found: ${request.method}`);
            }
        } catch (e: any) {
            return this.errorResponse(id, -32603, e?.message || "Tool execution failed");
        }
    }

    private async callTool(name: string, args: any) {
        const tool = this.getTools().find(t => t.name === name);
        if (!tool) return this.toolResult(false, null, "TOOL_NOT_FOUND", `Unknown tool: ${name}`);
        if (!tool.readOnly && this.plugin.settings.mcpReadOnly) {
            return this.toolResult(false, null, "READ_ONLY", "DidaSync MCP server is in read-only mode");
        }

        try {
            switch (name) {
                case "dida_list_tasks":
                    return this.toolResult(true, this.listTasks(args));
                case "dida_get_task":
                    return this.toolResult(true, this.serializeTask(this.findTaskOrThrow(args)));
                case "dida_search_tasks":
                    return this.toolResult(true, this.searchTasks(args));
                case "dida_create_task":
                    return this.toolResult(true, await this.createTask(args));
                case "dida_update_task":
                    return this.toolResult(true, await this.updateTask(args));
                case "dida_schedule_tasks":
                    return this.toolResult(true, await this.scheduleTasks(args));
                case "dida_complete_task":
                    return this.toolResult(true, await this.completeTask(args));
                case "dida_delete_task":
                    return this.toolResult(true, await this.deleteTask(args));
                case "dida_sync_now":
                    return this.toolResult(true, await this.syncNow());
                case "dida_list_projects":
                    return this.toolResult(true, this.listProjects());
                default:
                    return this.toolResult(false, null, "TOOL_NOT_FOUND", `Unknown tool: ${name}`);
            }
        } catch (e: any) {
            return this.toolResult(false, null, "TOOL_ERROR", e?.message || "Tool execution failed");
        }
    }

    private listTasks(args: any) {
        let tasks = [...(this.plugin.settings.tasks || [])];
        const completion = this.normalizeEnum(args?.completion, ["active", "completed", "all"], "completion");
        if (typeof args?.status === "number") {
            tasks = tasks.filter(t => t.status === args.status);
        } else if (completion === "completed") {
            tasks = tasks.filter(t => t.status === 2);
        } else if (completion === "all" || args?.includeCompleted === true) {
            // Keep all tasks.
        } else {
            tasks = tasks.filter(t => t.status !== 2);
        }

        const query = String(args?.query || "").trim().toLowerCase();
        if (query) tasks = tasks.filter(t => [t.title, t.content, t.desc, t.projectName].some(v => String(v || "").toLowerCase().includes(query)));
        if (args?.projectId) tasks = tasks.filter(t => t.projectId === args.projectId);
        if (args?.projectName) {
            const projectName = String(args.projectName).trim().toLowerCase();
            tasks = tasks.filter(t => String(t.projectName || "").toLowerCase().includes(projectName));
        }
        if (typeof args?.priority === "number") tasks = tasks.filter(t => Number(t.priority || 0) === Number(args.priority));
        if (typeof args?.isAllDay === "boolean") tasks = tasks.filter(t => !!t.isAllDay === args.isAllDay);

        const datePreset = this.normalizeEnum(args?.datePreset, ["overdue", "today", "tomorrow", "this_week", "scheduled", "unscheduled"], "datePreset");
        const dateField = this.normalizeEnum(args?.dateField, ["startDate", "dueDate", "either"], "dateField") || "either";
        const range = this.resolveDateRange(args?.from, args?.to, datePreset);
        if (datePreset === "scheduled") tasks = tasks.filter(t => !!(t.startDate || t.dueDate));
        if (datePreset === "unscheduled") tasks = tasks.filter(t => !(t.startDate || t.dueDate));
        if (range) tasks = tasks.filter(t => this.taskMatchesDateRange(t, dateField, range.from, range.to));

        const sortBy = this.normalizeEnum(args?.sortBy, ["date", "priority", "updatedAt", "createdAt", "title"], "sortBy") || "date";
        const sortDirection = this.normalizeEnum(args?.sortDirection, ["asc", "desc"], "sortDirection") || "asc";
        tasks.sort((a, b) => this.compareTasks(a, b, sortBy) * (sortDirection === "desc" ? -1 : 1));

        const limit = Math.max(1, Math.min(parseInt(args?.limit || "100", 10), 500));
        return tasks.slice(0, limit).map(t => this.serializeTask(t, dateField));
    }

    private findTaskOrThrow(args: any): DidaTask {
        const task = this.findTask(args);
        if (!task) throw new Error("Task not found");
        return task;
    }

    private searchTasks(args: any) {
        const query = String(args?.query || "").trim().toLowerCase();
        if (!query) throw new Error("query is required");
        const limit = Math.max(1, Math.min(parseInt(args?.limit || "50", 10), 200));
        return (this.plugin.settings.tasks || [])
            .filter(t => [t.title, t.content, t.desc, t.projectName].some(v => String(v || "").toLowerCase().includes(query)))
            .slice(0, limit)
            .map(t => this.serializeTask(t));
    }

    private async createTask(args: any) {
        const title = String(args?.title || "").trim();
        if (!title) throw new Error("title is required");
        this.validateTaskDates(args);
        if (args?.requestId && this.recentCreateRequests.has(args.requestId)) {
            return this.serializeTask(this.recentCreateRequests.get(args.requestId)!);
        }

        const task = await this.plugin.addTask(
            title,
            args?.projectName || "收集箱",
            args?.projectId || "inbox",
            args?.sync !== false,
            args?.dueDate || null
        );
        this.applyTaskPatch(task, args, false);
        if (args?.sync !== false && this.plugin.settings.accessToken && task.didaId) {
            await this.plugin.updateTaskInDidaList(task);
        }
        await this.plugin.saveSettings();
        this.plugin.refreshTaskView();
        if (args?.requestId) this.recentCreateRequests.set(args.requestId, task);
        return this.serializeTask(task);
    }

    private async updateTask(args: any) {
        const task = this.findTaskOrThrow(args);
        this.validateTaskDates(args);
        this.applyTaskPatch(task, args, true);
        await this.plugin.saveSettings();
        if (this.plugin.settings.accessToken && task.didaId && args?.sync !== false) {
            await this.plugin.updateTaskInDidaList(task);
        }
        this.plugin.refreshTaskView();
        return this.serializeTask(task);
    }

    private async scheduleTasks(args: any) {
        if (!Array.isArray(args?.items) || args.items.length === 0) throw new Error("items is required and must be a non-empty array");
        const updated: any[] = [];
        const errors: any[] = [];
        const shouldSync = args?.sync !== false;

        for (const [index, item] of args.items.entries()) {
            try {
                if (!item || typeof item !== "object") throw new Error("item must be an object");
                if (item.startDate === undefined && item.dueDate === undefined) throw new Error("startDate or dueDate is required for each schedule item");
                const task = this.findTaskOrThrow(item);
                this.validateTaskDates(item);
                this.applyTaskPatch(task, {
                    startDate: item.startDate,
                    dueDate: item.dueDate,
                    isAllDay: item.isAllDay
                }, false);
                updated.push(this.serializeTask(task));
            } catch (e: any) {
                errors.push({ index, id: item?.id, didaId: item?.didaId, message: e?.message || "Failed to schedule task" });
            }
        }

        if (updated.length > 0) {
            await this.plugin.saveSettings();
            if (this.plugin.settings.accessToken && shouldSync) {
                for (const result of updated) {
                    const task = this.findTask({ id: result.id, didaId: result.didaId });
                    if (task?.didaId) await this.plugin.updateTaskInDidaList(task);
                }
            }
            this.plugin.refreshTaskView();
        }

        return { updated, errors };
    }

    private async completeTask(args: any) {
        const task = this.findTaskOrThrow(args);
        const index = this.plugin.settings.tasks.indexOf(task);
        if (index === -1) throw new Error("Task not found");
        if (task.status !== 2) await this.plugin.toggleTask(index);
        return this.serializeTask(task);
    }

    private async deleteTask(args: any) {
        const task = this.findTaskOrThrow(args);
        const index = this.plugin.settings.tasks.indexOf(task);
        if (index === -1) throw new Error("Task not found");
        await this.plugin.deleteTask(index);
        return this.serializeTask(task);
    }

    private async syncNow() {
        await this.plugin.manualSync();
        return { taskCount: this.plugin.settings.tasks.length };
    }

    private listProjects(): DidaProject[] {
        const projects = new Map<string, DidaProject>();
        projects.set("inbox", { id: "inbox", name: "收集箱" });
        for (const project of this.plugin.settings.projects || []) {
            if (project.id) projects.set(project.id, project);
        }
        for (const task of this.plugin.settings.tasks || []) {
            const id = task.projectId || "inbox";
            if (!projects.has(id)) {
                projects.set(id, {
                    id,
                    name: task.projectName || (id === "inbox" ? "收集箱" : id),
                    color: task.projectColor,
                    closed: task.projectClosed,
                    viewMode: task.projectViewMode,
                    permission: task.projectPermission,
                    kind: task.projectKind
                });
            }
        }
        return Array.from(projects.values());
    }

    private applyTaskPatch(task: DidaTask, args: any, allowStatus: boolean) {
        for (const key of ["title", "content", "desc", "dueDate", "startDate", "projectId", "projectName", "priority"] as const) {
            if (args[key] !== undefined) (task as any)[key] = args[key];
        }
        if (args.isAllDay !== undefined) task.isAllDay = !!args.isAllDay;
        if (allowStatus && args.status !== undefined) task.status = Number(args.status);
        task.updatedAt = new Date().toISOString();
    }

    private findTask(args: any): DidaTask | null {
        if (!args) return null;
        const id = args.id || args.didaId;
        if (!id) throw new Error("id or didaId is required");
        return (this.plugin.settings.tasks || []).find(t => t.id === id || t.didaId === id) || null;
    }

    private serializeTask(task: DidaTask, dateField: string = "either") {
        return {
            id: task.id,
            didaId: task.didaId,
            title: task.title,
            content: task.content,
            desc: task.desc,
            status: task.status,
            projectId: task.projectId,
            projectName: task.projectName,
            dueDate: task.dueDate,
            startDate: task.startDate,
            isAllDay: task.isAllDay,
            priority: task.priority,
            completedTime: task.completedTime,
            items: task.items || [],
            updatedAt: task.updatedAt,
            createdAt: task.createdAt,
            matchedDate: this.pickTaskDate(task, dateField)
        };
    }

    private getTools(): ToolDefinition[] {
        const idInput = {
            type: "object",
            additionalProperties: false,
            properties: {
                id: { type: "string", description: "DidaSync local task id returned by list/search/get tools. Use either id or didaId." },
                didaId: { type: "string", description: "TickTick/Dida task id returned by list/search/get tools. Prefer didaId when available. Use either id or didaId." }
            }
        };
        return [
            {
                name: "dida_list_tasks",
                description: "List tasks from the local DidaSync cache. Use this before planning, summarizing, filtering overdue/today tasks, or choosing tasks to update. Defaults to unfinished tasks only; set completion='all' to include completed tasks.",
                readOnly: true,
                inputSchema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        completion: { type: "string", enum: ["active", "completed", "all"], description: "Completion filter. Use 'active' for unfinished tasks, 'completed' for finished tasks, or 'all'. Default is 'active'." },
                        includeCompleted: { type: "boolean", description: "Legacy compatibility flag. Prefer completion='all' instead." },
                        status: { type: "number", enum: [0, 2], description: "Low-level status filter. 0 means active, 2 means completed. Prefer completion unless the user explicitly asks for a numeric status." },
                        datePreset: { type: "string", enum: ["overdue", "today", "tomorrow", "this_week", "scheduled", "unscheduled"], description: "Common date filter. 'overdue' means before today and not completed; 'scheduled' means has startDate or dueDate; 'unscheduled' means no date." },
                        from: { type: "string", description: "Inclusive date/time range start. Use YYYY-MM-DD for a whole day or ISO datetime such as 2026-05-25T09:00:00+08:00." },
                        to: { type: "string", description: "Inclusive date/time range end. Use YYYY-MM-DD for a whole day or ISO datetime such as 2026-05-25T18:00:00+08:00." },
                        dateField: { type: "string", enum: ["startDate", "dueDate", "either"], description: "Which task date to filter by. Default 'either' checks startDate first, then dueDate." },
                        query: { type: "string", description: "Case-insensitive text search across title, content, description, and project name." },
                        projectId: { type: "string", description: "Exact project id. Use dida_list_projects first if only a project name is known." },
                        projectName: { type: "string", description: "Partial project name match, useful when the user names a project but projectId is unknown." },
                        priority: { type: "number", description: "Exact numeric Dida priority. Common values are 0 for none, 1 low, 3 medium, 5 high." },
                        isAllDay: { type: "boolean", description: "Filter all-day tasks when true or timed tasks when false." },
                        sortBy: { type: "string", enum: ["date", "priority", "updatedAt", "createdAt", "title"], description: "Sort field. Default is date." },
                        sortDirection: { type: "string", enum: ["asc", "desc"], description: "Sort direction. Default is asc." },
                        limit: { type: "number", minimum: 1, maximum: 500, description: "Maximum number of tasks to return. Default 100, max 500." }
                    }
                }
            },
            { name: "dida_get_task", description: "Get one full task by local id or Dida id. Use this after list/search when you need details for a specific task. Provide either id or didaId.", readOnly: true, inputSchema: idInput },
            {
                name: "dida_search_tasks",
                description: "Search tasks by title, content, description, or project name. Use when the user names a task but you do not know its id. Defaults to returning active and completed matches.",
                readOnly: true,
                inputSchema: {
                    type: "object",
                    required: ["query"],
                    additionalProperties: false,
                    properties: {
                        query: { type: "string", description: "Required search text, for example a task title keyword or project name." },
                        limit: { type: "number", minimum: 1, maximum: 200, description: "Maximum number of tasks to return. Default 50, max 200." }
                    }
                }
            },
            {
                name: "dida_create_task",
                description: "Create a new DidaSync task locally and optionally sync it to TickTick/Dida. Use only when the user asks to add/create/remember a new task.",
                inputSchema: {
                    type: "object",
                    required: ["title"],
                    additionalProperties: false,
                    properties: this.taskMutationProperties(true)
                }
            },
            {
                name: "dida_update_task",
                description: "Update one existing task by local id or Dida id. Use only after you know the exact task from list/search/get. Provide either id or didaId and only the fields to change.",
                inputSchema: {
                    type: "object",
                    additionalProperties: false,
                    properties: { ...idInput.properties, ...this.taskMutationProperties(false), status: { type: "number", enum: [0, 2], description: "Set 0 for active or 2 for completed. Prefer dida_complete_task to complete a task." } }
                }
            },
            {
                name: "dida_schedule_tasks",
                description: "Batch schedule existing tasks for daily planning or time blocking. Use after dida_list_tasks/search identifies exact task ids. Updates only startDate, dueDate, and isAllDay for each item.",
                inputSchema: {
                    type: "object",
                    required: ["items"],
                    additionalProperties: false,
                    properties: {
                        items: {
                            type: "array",
                            minItems: 1,
                            description: "Tasks to schedule. Each item must include id or didaId plus at least startDate or dueDate.",
                            items: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    id: idInput.properties.id,
                                    didaId: idInput.properties.didaId,
                                    startDate: { type: "string", description: "New task start time/date. Use ISO datetime with timezone for timed blocks, e.g. 2026-05-25T09:00:00+08:00." },
                                    dueDate: { type: "string", description: "New task end/due time/date. For timed blocks, should be after startDate. For all-day tasks, use YYYY-MM-DD or midnight ISO." },
                                    isAllDay: { type: "boolean", description: "true for all-day tasks; false for timed tasks." }
                                }
                            }
                        },
                        sync: { type: "boolean", description: "Whether to sync changed tasks to TickTick/Dida immediately. Default true." }
                    }
                }
            },
            { name: "dida_complete_task", description: "Mark one task completed by local id or Dida id. Use when the user explicitly says the task is done/finished/completed. Provide either id or didaId.", inputSchema: idInput },
            { name: "dida_delete_task", description: "Delete one task by local id or Dida id. Use only when the user explicitly asks to delete/remove a task. Provide either id or didaId.", inputSchema: idInput },
            { name: "dida_sync_now", description: "Run DidaSync manual two-way sync. Use when the user asks to sync/refresh/pull latest tasks.", inputSchema: { type: "object", additionalProperties: false, properties: {} } },
            { name: "dida_list_projects", description: "List projects known to the local DidaSync cache. Use before create/update when only the project name is known and projectId is needed.", readOnly: true, inputSchema: { type: "object", additionalProperties: false, properties: {} } }
        ];
    }

    private taskMutationProperties(includeRequestId: boolean) {
        const properties: any = {
            title: { type: "string", description: "Task title. Required for create; omit for update unless changing the title." },
            content: { type: "string", description: "Task content/body. Use for longer notes." },
            desc: { type: "string", description: "Task description. Use only when the user explicitly provides description text." },
            projectId: { type: "string", description: "Target project id. Use 'inbox' for 收集箱 or dida_list_projects to find a project id." },
            projectName: { type: "string", description: "Human-readable project name. Use together with projectId when known." },
            dueDate: { type: "string", description: "Due/end date. Use YYYY-MM-DD for date-only tasks or ISO datetime with timezone, e.g. 2026-05-25T18:00:00+08:00." },
            startDate: { type: "string", description: "Start date/time. Use ISO datetime with timezone for time blocking, e.g. 2026-05-25T09:00:00+08:00." },
            isAllDay: { type: "boolean", description: "true when the user gives only a date; false when the user gives a specific time or time block." },
            priority: { type: "number", description: "Numeric Dida priority. Common values: 0 none, 1 low, 3 medium, 5 high." },
            sync: { type: "boolean", description: "Whether to sync this change to TickTick/Dida immediately. Default true." }
        };
        if (includeRequestId) properties.requestId = { type: "string", description: "Optional idempotency key for create calls. Reuse the same value only when retrying the same create request." };
        return properties;
    }

    private normalizeEnum(value: any, allowed: string[], name: string) {
        if (value === undefined || value === null || value === "") return undefined;
        const normalized = String(value);
        if (!allowed.includes(normalized)) throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
        return normalized;
    }

    private resolveDateRange(fromArg: any, toArg: any, datePreset?: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        if (datePreset === "overdue") return { from: new Date(0), to: new Date(today.getTime() - 1) };
        if (datePreset === "today") return this.dayRange(today);
        if (datePreset === "tomorrow") return this.dayRange(tomorrow);
        if (datePreset === "this_week") {
            const end = new Date(today);
            end.setDate(today.getDate() + 7);
            end.setMilliseconds(-1);
            return { from: today, to: end };
        }

        if (!fromArg && !toArg) return null;
        return {
            from: fromArg ? this.parseDateBoundary(String(fromArg), false) : new Date(0),
            to: toArg ? this.parseDateBoundary(String(toArg), true) : new Date(8640000000000000)
        };
    }

    private dayRange(date: Date) {
        const from = new Date(date);
        from.setHours(0, 0, 0, 0);
        const to = new Date(date);
        to.setHours(23, 59, 59, 999);
        return { from, to };
    }

    private parseDateBoundary(value: string, endOfDay: boolean) {
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
        const date = dateOnly ? new Date(`${value}T00:00:00`) : new Date(value);
        if (isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
        if (dateOnly && endOfDay) date.setHours(23, 59, 59, 999);
        return date;
    }

    private taskMatchesDateRange(task: DidaTask, dateField: string, from: Date, to: Date) {
        const dates = dateField === "either" ? [task.startDate, task.dueDate] : [(task as any)[dateField]];
        return dates.some(value => {
            if (!value) return false;
            const date = new Date(value);
            if (isNaN(date.getTime())) return false;
            return date >= from && date <= to;
        });
    }

    private compareTasks(a: DidaTask, b: DidaTask, sortBy: string) {
        if (sortBy === "title") return String(a.title || "").localeCompare(String(b.title || ""));
        if (sortBy === "priority") return Number(a.priority || 0) - Number(b.priority || 0);
        if (sortBy === "updatedAt" || sortBy === "createdAt") return this.dateValue((a as any)[sortBy]) - this.dateValue((b as any)[sortBy]);
        return this.dateValue(this.pickTaskDate(a, "either")) - this.dateValue(this.pickTaskDate(b, "either"));
    }

    private pickTaskDate(task: DidaTask, dateField: string) {
        if (dateField === "startDate") return task.startDate || null;
        if (dateField === "dueDate") return task.dueDate || null;
        return task.startDate || task.dueDate || null;
    }

    private dateValue(value?: string | null) {
        if (!value) return Number.MAX_SAFE_INTEGER;
        const time = new Date(value).getTime();
        return isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
    }

    private validateTaskDates(args: any) {
        if (!args) return;
        if (args.startDate !== undefined) this.validateDateValue(args.startDate, "startDate");
        if (args.dueDate !== undefined) this.validateDateValue(args.dueDate, "dueDate");
        if (args.startDate && args.dueDate) {
            const start = new Date(args.startDate).getTime();
            const due = new Date(args.dueDate).getTime();
            if (!isNaN(start) && !isNaN(due) && due < start) throw new Error("dueDate must be after or equal to startDate");
        }
    }

    private validateDateValue(value: any, name: string) {
        if (value === null || value === "") return;
        const date = new Date(value);
        if (isNaN(date.getTime())) throw new Error(`${name} must be a valid date string, for example 2026-05-25 or 2026-05-25T09:00:00+08:00`);
    }

    private toolResult(ok: boolean, data?: any, code?: string, message?: string) {
        const result = ok ? { ok: true, data } : { ok: false, error: { code, message } };
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: !ok
        };
    }

    private isMcpPath(urlText: string) {
        try {
            return new URL(urlText, "http://127.0.0.1").pathname === "/mcp";
        } catch (e) {
            return false;
        }
    }

    private isAuthorized(req: http.IncomingMessage) {
        const token = this.plugin.settings.mcpToken;
        if (!token) return false;
        const authorization = String(req.headers.authorization || "");
        if (authorization === `Bearer ${token}`) return true;
        if (String(req.headers["x-didasync-mcp-token"] || "") === token) return true;
        try {
            return new URL(req.url || "", "http://127.0.0.1").searchParams.get("token") === token;
        } catch (e) {
            return false;
        }
    }

    private readBody(req: http.IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = "";
            req.on("data", chunk => body += chunk);
            req.on("end", () => resolve(body));
            req.on("error", reject);
        });
    }

    private successResponse(id: JsonRpcId, result: any) {
        return { jsonrpc: "2.0", id, result };
    }

    private errorResponse(id: JsonRpcId, code: number, message: string) {
        return { jsonrpc: "2.0", id, error: { code, message } };
    }

    private writeJson(res: http.ServerResponse, status: number, body: any) {
        this.setCorsHeaders(res);
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(body));
    }

    private openSseStream(req: http.IncomingMessage, res: http.ServerResponse) {
        this.setCorsHeaders(res);
        res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        });
        res.write(": DidaSync MCP stream connected\n\n");
        const keepAlive = setInterval(() => {
            if (!res.destroyed) res.write(": keep-alive\n\n");
        }, 30000);
        req.on("close", () => {
            clearInterval(keepAlive);
            if (!res.destroyed) res.end();
        });
    }

    private setCorsHeaders(res: http.ServerResponse) {
        res.setHeader("Access-Control-Allow-Origin", "app://obsidian.md");
        res.setHeader("Access-Control-Allow-Headers", [
            "Accept",
            "Content-Type",
            "Authorization",
            "X-DidaSync-MCP-Token",
            "Mcp-Protocol-Version",
            "mcp-protocol-version",
            "Mcp-Session-Id",
            "mcp-session-id",
            "Last-Event-ID",
            "last-event-id"
        ].join(", "));
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, mcp-session-id");
    }

    notifyStartupError(error: any) {
        new Notice("DidaSync MCP服务启动失败: " + (error?.message || error));
    }
}
