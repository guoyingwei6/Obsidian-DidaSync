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
        if (!args?.includeCompleted) tasks = tasks.filter(t => t.status !== 2);
        if (typeof args?.status === "number") tasks = tasks.filter(t => t.status === args.status);
        if (args?.projectId) tasks = tasks.filter(t => t.projectId === args.projectId);
        const limit = Math.max(1, Math.min(parseInt(args?.limit || "100", 10), 500));
        return tasks.slice(0, limit).map(t => this.serializeTask(t));
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
        this.applyTaskPatch(task, args, true);
        await this.plugin.saveSettings();
        if (this.plugin.settings.accessToken && task.didaId && args?.sync !== false) {
            await this.plugin.updateTaskInDidaList(task);
        }
        this.plugin.refreshTaskView();
        return this.serializeTask(task);
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

    private serializeTask(task: DidaTask) {
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
            createdAt: task.createdAt
        };
    }

    private getTools(): ToolDefinition[] {
        const idInput = {
            type: "object",
            properties: {
                id: { type: "string" },
                didaId: { type: "string" }
            }
        };
        return [
            {
                name: "dida_list_tasks",
                description: "List DidaSync tasks from the local Obsidian cache.",
                readOnly: true,
                inputSchema: {
                    type: "object",
                    properties: {
                        includeCompleted: { type: "boolean" },
                        status: { type: "number" },
                        projectId: { type: "string" },
                        limit: { type: "number" }
                    }
                }
            },
            { name: "dida_get_task", description: "Get one DidaSync task by local id or Dida id.", readOnly: true, inputSchema: idInput },
            {
                name: "dida_search_tasks",
                description: "Search DidaSync tasks by title, content, description, or project name.",
                readOnly: true,
                inputSchema: {
                    type: "object",
                    required: ["query"],
                    properties: { query: { type: "string" }, limit: { type: "number" } }
                }
            },
            {
                name: "dida_create_task",
                description: "Create a DidaSync task locally and optionally sync it to Dida.",
                inputSchema: {
                    type: "object",
                    required: ["title"],
                    properties: this.taskMutationProperties(true)
                }
            },
            {
                name: "dida_update_task",
                description: "Update a DidaSync task by local id or Dida id.",
                inputSchema: {
                    type: "object",
                    properties: { ...idInput.properties, ...this.taskMutationProperties(false), status: { type: "number" } }
                }
            },
            { name: "dida_complete_task", description: "Complete a DidaSync task by local id or Dida id.", inputSchema: idInput },
            { name: "dida_delete_task", description: "Delete a DidaSync task by local id or Dida id.", inputSchema: idInput },
            { name: "dida_sync_now", description: "Run DidaSync manual two-way sync.", inputSchema: { type: "object", properties: {} } },
            { name: "dida_list_projects", description: "List projects known to the local DidaSync cache.", readOnly: true, inputSchema: { type: "object", properties: {} } }
        ];
    }

    private taskMutationProperties(includeRequestId: boolean) {
        const properties: any = {
            title: { type: "string" },
            content: { type: "string" },
            desc: { type: "string" },
            projectId: { type: "string" },
            projectName: { type: "string" },
            dueDate: { type: "string" },
            startDate: { type: "string" },
            isAllDay: { type: "boolean" },
            priority: { type: "number" },
            sync: { type: "boolean" }
        };
        if (includeRequestId) properties.requestId = { type: "string" };
        return properties;
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
