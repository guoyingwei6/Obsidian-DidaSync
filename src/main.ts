import { Editor, EditorPosition, getIconIds, Menu, Modal, Notice, Plugin, setIcon, TFile, normalizePath } from 'obsidian';
import { DidaApiClient } from './api/DidaApiClient';
import { RRuleParser } from './core/RRuleParser';
import { TaskNoteSyncManager } from './managers/TaskNoteSyncManager';
import { McpServerManager } from './managers/McpServerManager';
import { NativeTaskSyncManager } from './managers/NativeTaskSyncManager';
import { RepeatTaskManager } from './managers/RepeatTaskManager';
import { SyncManager } from './managers/SyncManager';
import { DIDA_SKILL_DOC } from './skills/dida-skill-doc';
import { AddTaskToProjectModal } from './modals/AddTaskToProjectModal';
import { CompletedTasksModal } from './modals/CompletedTasksModal';
import { ProjectCreateModal } from './modals/ProjectCreateModal';
import { ProjectDeleteConfirmModal } from './modals/ProjectDeleteConfirmModal';
import { ProjectIconPickerModal } from './modals/ProjectIconPickerModal';
import { ProjectRenameModal } from './modals/ProjectRenameModal';
import { TaskNoteSyncModal } from './modals/TaskNoteSyncModal';
import { TaskSuggestionPopup } from './modals/TaskSuggestionPopup';
import { TimelineViewModal } from './modals/TimelineViewModal';
import { DidaSyncSettingTab } from './settings/DidaSyncSettingTab';
import { CompletedTasksQuery, DEFAULT_SETTINGS, DidaProject, DidaSyncSettings, DidaTask, ProjectCatalogEntry } from './types';
import { applyParsedLineToTask, formatTaskLine, formatTaskLineFromTask, makeLocalDateTime, parseTaskLine, TaskLineMetadata } from './taskLineFormat';
import { normalizePomodoroCompletionHistory, normalizePomodoroPresetMinutes } from './utils';
import { DidaTimeBlockView, TIME_BLOCK_VIEW_TYPE } from './views/DidaTimeBlockView';
import { TaskActionMenu } from './views/TaskActionMenu';
import { TASK_VIEW_TYPE, TaskView } from './views/TaskView';

const AUTO_SYNC_EDIT_PAUSE_MAX_MS = 36e4;
const AUTO_SYNC_EDIT_RECHECK_MS = 6e4;

let DIDA_LUCIDE_ICON_NAMES: string[] = [];
try {
    const iconIds = typeof getIconIds === "function" ? getIconIds() : null;
    if (Array.isArray(iconIds) && iconIds.length > 0) {
        DIDA_LUCIDE_ICON_NAMES = iconIds
            .filter((id) => typeof id === "string" && id.startsWith("lucide-"))
            .map((id) => id.substring("lucide-".length))
            .sort((a, b) => a.localeCompare(b));
    }
} catch (e) { }

export default class DidaSyncPlugin extends Plugin {
    settings: DidaSyncSettings;
    apiClient: DidaApiClient;
    syncManager: SyncManager;
    mcpServerManager: McpServerManager;
    nativeTaskSyncManager: NativeTaskSyncManager;
    repeatTaskManager: RepeatTaskManager;
    taskNoteSyncManager: TaskNoteSyncManager;
    currentTaskActionMenu: TaskActionMenu | null = null;
    isTaskActionInProgress: boolean = false;
    isPluginActivated: boolean = false;
    syncIntervalId: number | null = null;
    autoSyncTimeout: number | null = null;
    debouncedEditorChange: (editor: Editor, info: any) => void;
    statusBarItem: HTMLElement | null = null;
    _cachedTaskLeaf: any = null;
    _handleOnlineForAutoSync: (() => void) | null = null;
    _handleOfflineForAutoSync: (() => void) | null = null;
    _autoSyncDeferredSince: number | null = null;
    _nativeTaskSyncTimeouts: Map<string, number> | null = null;
    _isUpdatingNativeTaskStatus: boolean = false;
    _taskStatusChangeTimeout: number | null = null;
    _lastErrorTime: number | null = null;
    _projectCreationPromises: Map<string, Promise<any>> | null = null;
    taskActionMenuDebounceTimer: number | null = null;
    dateChangeDebounceTimer: number | null = null;
    lastTaskMenuTriggerTime: number = 0;
    isReverseUpdating: boolean = false;

    async onload() {
        await this.loadSettings();
        document.documentElement.style.setProperty("--dida-hour-height", `${this.settings.timeBlockHourHeight || 80}px`);

        this.apiClient = new DidaApiClient(this);
        this.syncManager = new SyncManager(this);
        this.mcpServerManager = new McpServerManager(this);
        this.nativeTaskSyncManager = new NativeTaskSyncManager(this);
        this.repeatTaskManager = new RepeatTaskManager(this);
        this.taskNoteSyncManager = new TaskNoteSyncManager(this.app, this);

        this.addSettingTab(new DidaSyncSettingTab(this.app, this));

        this.registerView(TASK_VIEW_TYPE, (leaf) => new TaskView(leaf, this));
        this.registerView(TIME_BLOCK_VIEW_TYPE, (leaf) => new DidaTimeBlockView(leaf, this));

        this.addRibbonIcon('check-square', 'Didasync', () => {
            this.openTaskViewWithCache();
        });
        this.addRibbonIcon("calendar-check", "滴答时间线视图", () => {
            this.showTimelineView();
        });

        this.addCommand({
            id: 'open-dida-task-view',
            name: '打开滴答清单',
            callback: () => {
                this.openTaskViewWithCache();
            }
        });

        this.addCommand({
            id: 'sync-dida-tasks',
            name: '手动双向同步',
            callback: () => {
                this.manualSync();
            }
        });

        this.addCommand({
            id: 'create-task-in-project',
            name: '在项目中创建任务',
            callback: () => {
                this.showAddTaskToProjectModal();
            }
        });

        this.addCommand({
            id: 'show-timeline-view',
            name: '显示时间线日历视图',
            callback: () => {
                this.showTimelineView();
            }
        });

        this.addCommand({
            id: 'sync-tasks-to-note',
            name: '同步任务到笔记',
            callback: () => {
                this.showTaskNoteSyncModal();
            }
        });

        this.addCommand({
            id: 'insert-create-dida-task',
            name: '插入/创建滴答任务',
            editorCallback: (editor: Editor) => {
                const cursor = editor.getCursor();
                this.showTaskSuggestions(editor, cursor);
            }
        });

        this.addCommand({
            id: 'fetch-completed-dida-tasks',
            name: '查看已完成任务',
            callback: () => {
                this.showCompletedTasksModal();
            }
        });

        this.initializePluginFeatures();
        this.mcpServerManager.start().catch((e) => this.mcpServerManager.notifyStartupError(e));
    }

    async onunload() {
        if (this.mcpServerManager) {
            await this.mcpServerManager.stop();
        }
        this.clearAutoSync();
        try {
            if (this._handleOnlineForAutoSync) {
                window.removeEventListener("online", this._handleOnlineForAutoSync);
                this._handleOnlineForAutoSync = null;
            }
            if (this._handleOfflineForAutoSync) {
                window.removeEventListener("offline", this._handleOfflineForAutoSync);
                this._handleOfflineForAutoSync = null;
            }
        } catch (e) { }
        this._cachedTaskLeaf = null;
        if (this._taskStatusChangeTimeout) {
            clearTimeout(this._taskStatusChangeTimeout);
            this._taskStatusChangeTimeout = null;
        }
        this._lastErrorTime = null;
        const menus = document.querySelectorAll(".task-action-menu-inline");
        menus.forEach(m => m.remove());
    }

    async loadSettings() {
        const loadedSettings = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
        const legacySettings = this.settings as any;
        if (loadedSettings?.dailySyncTargetBlockHeader && !loadedSettings?.taskNoteSyncTargetBlockHeader) {
            this.settings.taskNoteSyncTargetBlockHeader = loadedSettings.dailySyncTargetBlockHeader;
            delete legacySettings.dailySyncTargetBlockHeader;
        }
        if (!this.settings.tasks) this.settings.tasks = [];
        this.settings.tasks.forEach(t => {
            if (t.content === undefined) t.content = "";
            if (t.desc === undefined) t.desc = "";
            if (t.items === undefined) t.items = [];
        });
        if (this.settings.autoCleanCompletedTasks === undefined) this.settings.autoCleanCompletedTasks = false;
        if (this.settings.autoCleanInterval === undefined) this.settings.autoCleanInterval = 1;
        if (this.settings.projectCollapsedStates === undefined) this.settings.projectCollapsedStates = {};
        if (!this.settings.projectIcons || typeof this.settings.projectIcons !== "object") this.settings.projectIcons = {};
        if (!Array.isArray(this.settings.hiddenProjectKeys)) this.settings.hiddenProjectKeys = [];
        if (!["all", "visible", "custom"].includes(this.settings.taskNoteSyncProjectScope)) this.settings.taskNoteSyncProjectScope = "all";
        if (!Array.isArray(this.settings.taskNoteSyncProjectKeys)) this.settings.taskNoteSyncProjectKeys = [];
        if (!Array.isArray(this.settings.projectCatalog)) this.settings.projectCatalog = [];
        this.settings.projectCatalog = this.normalizeProjectCatalog(this.settings.projectCatalog);
        await this.ensureProjectCatalogFromTasks();

        if (this.settings.pomodoroSettings && typeof this.settings.pomodoroSettings === "object") {
            this.settings.pomodoroSettings = { ...DEFAULT_SETTINGS.pomodoroSettings, ...this.settings.pomodoroSettings };
        } else {
            this.settings.pomodoroSettings = { ...DEFAULT_SETTINGS.pomodoroSettings };
        }
        this.settings.pomodoroSettings.focusPresetMinutes = normalizePomodoroPresetMinutes(
            this.settings.pomodoroSettings.focusPresetMinutes,
            1,
            90,
            DEFAULT_SETTINGS.pomodoroSettings.focusPresetMinutes
        );
        this.settings.pomodoroSettings.shortBreakMinutes = Math.max(
            1,
            Math.min(
                15,
                parseInt(String(this.settings.pomodoroSettings.shortBreakMinutes), 10) || DEFAULT_SETTINGS.pomodoroSettings.shortBreakMinutes
            )
        );
        this.settings.pomodoroSettings.longBreakMinutes = Math.max(
            15,
            Math.min(
                30,
                parseInt(String(this.settings.pomodoroSettings.longBreakMinutes), 10) || DEFAULT_SETTINGS.pomodoroSettings.longBreakMinutes
            )
        );
        this.settings.pomodoroSettings.longBreakPresetMinutes = normalizePomodoroPresetMinutes(
            this.settings.pomodoroSettings.longBreakPresetMinutes,
            15,
            30,
            DEFAULT_SETTINGS.pomodoroSettings.longBreakPresetMinutes
        );
        this.settings.pomodoroSettings.completionHistory = normalizePomodoroCompletionHistory(
            this.settings.pomodoroSettings.completionHistory
        );
        if (this.settings.enableMcpServer === undefined) this.settings.enableMcpServer = false;
        if (this.settings.mcpPort === undefined) this.settings.mcpPort = 35829;
        if (this.settings.mcpToken === undefined) this.settings.mcpToken = "";
        if (this.settings.mcpReadOnly === undefined) this.settings.mcpReadOnly = false;
        if (!this.settings.mcpSkillNotePath) this.settings.mcpSkillNotePath = DEFAULT_SETTINGS.mcpSkillNotePath;
        await this.saveSettings();
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async exportMcpSkillDocument() {
        const normalizedPath = normalizePath((this.settings.mcpSkillNotePath || DEFAULT_SETTINGS.mcpSkillNotePath).trim());
        if (!normalizedPath) {
            throw new Error("Skill 文档路径不能为空");
        }

        const pathParts = normalizedPath.split("/").filter(Boolean);
        if (pathParts.length === 0) {
            throw new Error("Skill 文档路径无效");
        }

        const folderParts = pathParts.slice(0, -1);
        let currentPath = "";
        for (const part of folderParts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const folderPath = normalizePath(currentPath);
            if (!(await this.app.vault.adapter.exists(folderPath))) {
                await this.app.vault.createFolder(folderPath);
            }
        }

        const existingFile = this.app.vault.getAbstractFileByPath(normalizedPath);
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, DIDA_SKILL_DOC);
        } else {
            await this.app.vault.create(normalizedPath, DIDA_SKILL_DOC);
        }

        return normalizedPath;
    }

    normalizeProjectCatalogEntry(entry: any): ProjectCatalogEntry | null {
        if (!entry || typeof entry !== "object") return null;
        const name = typeof entry.name === "string" ? entry.name.trim() : "";
        if (!name) return null;
        const id = typeof entry.id === "string" ? entry.id.trim() : "";
        return {
            id,
            name,
            isArchived: entry.isArchived === true,
            isLocalOnly: entry.isLocalOnly === true || (!id && entry.isLocalOnly !== false)
        };
    }

    normalizeProjectCatalog(catalog: any[]): ProjectCatalogEntry[] {
        const normalized: ProjectCatalogEntry[] = [];
        const seen = new Set<string>();
        (Array.isArray(catalog) ? catalog : []).forEach((entry) => {
            const normalizedEntry = this.normalizeProjectCatalogEntry(entry);
            if (!normalizedEntry) return;
            const key = normalizedEntry.id
                ? `id:${normalizedEntry.id.toLowerCase()}`
                : `name:${normalizedEntry.name.trim().toLowerCase()}`;
            if (seen.has(key)) return;
            seen.add(key);
            normalized.push(normalizedEntry);
        });
        return normalized;
    }

    getProjectCatalog(): ProjectCatalogEntry[] {
        return this.normalizeProjectCatalog(this.settings.projectCatalog || []);
    }

    getTaskDerivedProjects(): ProjectCatalogEntry[] {
        const map = new Map<string, ProjectCatalogEntry>();
        map.set(this.getProjectIconConfigKey("inbox", "收集箱"), {
            id: "inbox",
            name: "收集箱",
            isArchived: false,
            isLocalOnly: false
        });
        (Array.isArray(this.settings.tasks) ? this.settings.tasks : []).forEach((task) => {
            if (!task || task.parentId) return;
            let name = task.projectName || "";
            let id = task.projectId || "";
            if (!name && id) {
                if (id === "inbox" || id.includes("inbox")) {
                    name = "收集箱";
                    id = "inbox";
                } else {
                    name = id;
                }
            } else if (!id && name) {
                id = task.projectId || "";
            }
            name = name || "本地任务";
            const key = this.getProjectIconConfigKey(id, name);
            if (!map.has(key)) {
                map.set(key, {
                    id,
                    name,
                    isArchived: task.projectClosed === true,
                    isLocalOnly: !id || id === "local"
                });
            }
        });
        return Array.from(map.values());
    }

    async ensureProjectCatalogFromTasks() {
        const current = this.getProjectCatalog();
        const catalogMap = new Map<string, ProjectCatalogEntry>();
        current.forEach((entry) => {
            const key = entry.id ? `id:${entry.id.toLowerCase()}` : `name:${entry.name.trim().toLowerCase()}`;
            catalogMap.set(key, entry);
        });
        let changed = false;
        this.getTaskDerivedProjects().forEach((entry) => {
            const idKey = entry.id ? `id:${entry.id.toLowerCase()}` : "";
            const nameKey = `name:${entry.name.trim().toLowerCase()}`;
            if (!catalogMap.has(idKey || nameKey) && !catalogMap.has(nameKey)) {
                catalogMap.set(idKey || nameKey, entry);
                changed = true;
            }
        });
        if (changed) {
            this.settings.projectCatalog = Array.from(catalogMap.values());
            await this.saveSettings();
        } else {
            this.settings.projectCatalog = current;
        }
    }

    generateTemporaryProjectId() {
        return `local-project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    isTemporaryProjectId(projectId: string) {
        return typeof projectId === "string" && projectId.startsWith("local-project-");
    }

    findProjectByName(name: string) {
        const target = typeof name === "string" ? name.trim().toLowerCase() : "";
        if (!target) return null;
        return this.getAvailableProjectConfigs().find((entry) => typeof entry?.name === "string" && entry.name.trim().toLowerCase() === target) || null;
    }

    getProjectTaskCount(project: ProjectCatalogEntry) {
        if (!project || !project.name) return 0;
        const id = typeof project.id === "string" ? project.id.trim() : "";
        const name = project.name;
        const hasId = !!id;
        return (Array.isArray(this.settings.tasks) ? this.settings.tasks : []).filter((task) => {
            if (!task) return false;
            const byId = hasId && task.projectId === id;
            const byName = task.projectName === name;
            return byId || byName;
        }).length;
    }

    getProjectDeleteState(project: ProjectCatalogEntry) {
        if (!project || !project.name) return { disabled: true, reason: "该项目暂时无法删除" };
        if (this.isInboxProject(project.id, project.name)) return { disabled: true, reason: "收集箱不支持删除标题" };
        if (this.getProjectTaskCount(project) > 0) return { disabled: true, reason: "项目内仍有任务，无法删除标题" };
        return { disabled: false, reason: "删除项目标题" };
    }

    getProjectIconConfigKey(projectId: string, projectName: string) {
        return projectId && typeof projectId === "string" && projectId.trim()
            ? `id:${projectId.trim()}`
            : `name:${(projectName || "").trim()}`;
    }

    getProjectFilterKey(projectId: string, projectName: string) {
        return this.getProjectIconConfigKey(projectId, projectName);
    }

    getProjectFilterKeyAliases(projectId: string, projectName: string) {
        const aliases = new Set<string>();
        const id = typeof projectId === "string" ? projectId.trim() : "";
        const name = typeof projectName === "string" ? projectName.trim() : "";
        if (id) aliases.add(`id:${id}`);
        if (name) aliases.add(`name:${name}`);
        aliases.add(this.getProjectFilterKey(id, name));
        return Array.from(aliases).filter(Boolean);
    }

    isProjectHidden(projectId: string, projectName: string) {
        const hidden = Array.isArray(this.settings.hiddenProjectKeys) ? this.settings.hiddenProjectKeys : [];
        if (hidden.length === 0) return false;
        return this.getProjectFilterKeyAliases(projectId, projectName).some((key) => hidden.includes(key));
    }

    isProjectVisible(projectId: string, projectName: string) {
        return !this.isProjectHidden(projectId, projectName);
    }

    async setProjectHidden(projectId: string, projectName: string, hidden: boolean) {
        if (!Array.isArray(this.settings.hiddenProjectKeys)) this.settings.hiddenProjectKeys = [];
        const aliases = this.getProjectFilterKeyAliases(projectId, projectName);
        const next = new Set(this.settings.hiddenProjectKeys.filter((key) => !aliases.includes(key)));
        if (hidden) next.add(this.getProjectFilterKey(projectId, projectName));
        this.settings.hiddenProjectKeys = Array.from(next);
        await this.saveSettings();
        this.refreshTaskView();
    }

    getTaskProjectFilterKey(task: DidaTask) {
        const info = this.resolveTaskProjectInfo(task);
        return this.getProjectFilterKey(info.id, info.name);
    }

    resolveTaskProjectInfo(task: DidaTask) {
        let projectName = "本地任务";
        let projectId = "local";

        if (task.projectName && task.projectId) {
            projectName = task.projectName;
            projectId = task.projectId;
        } else if (task.projectId) {
            if (task.projectId === "inbox" || task.projectId.includes("inbox")) {
                projectName = "收集箱";
                projectId = "inbox";
            } else {
                projectName = task.projectId;
                projectId = task.projectId;
            }
        } else if (task.projectName) {
            projectName = task.projectName;
            projectId = task.projectId || "inbox";
        }

        return {
            id: projectId,
            name: projectName,
            isArchived: task.projectClosed === true,
            isLocalOnly: !projectId || projectId === "local"
        };
    }

    // [Deprecated] 项目图标功能已移除，保留方法以保持向后兼容
    getProjectDefaultIconName(projectName: string) {
        return projectName === "收集箱" ? "inbox" : "list-checks";
    }

    isInboxProject(projectId: string, projectName: string) {
        const id = typeof projectId === "string" ? projectId.trim().toLowerCase() : "";
        const name = typeof projectName === "string" ? projectName.trim().toLowerCase() : "";
        return !(id !== "inbox" && !id.includes("inbox")) || name === "收集箱" || name === "inbox";
    }

    getProjectIconName(projectId: string, projectName: string) {
        const icons = this.settings.projectIcons || {};
        const key = this.getProjectIconConfigKey(projectId, projectName);
        return icons[key] || icons[this.getProjectIconConfigKey("", projectName)] || this.getProjectDefaultIconName(projectName);
    }

    async setProjectIconName(projectId: string, projectName: string, iconName: string) {
        if (!this.settings.projectIcons || typeof this.settings.projectIcons !== "object") this.settings.projectIcons = {};
        const key = this.getProjectIconConfigKey(projectId, projectName);
        const next = (iconName || "").trim();
        if (next) this.settings.projectIcons[key] = next;
        else delete this.settings.projectIcons[key];
        await this.saveSettings();
    }

    // [Deprecated] 项目图标渲染功能已移除，保留方法以保持向后兼容
    renderProjectIcon(container: HTMLElement, projectId: string, projectName: string) {
        if (!container) return;
        container.empty();
        const iconName = this.getProjectIconName(projectId, projectName);
        let rendered = false;
        try {
            setIcon(container, iconName);
            rendered = !!container.querySelector("svg");
        } catch (e) { }
        if (!rendered) {
            container.empty();
            try {
                setIcon(container, this.getProjectDefaultIconName(projectName));
            } catch (e) { }
        }
        const svg = container.querySelector("svg");
        if (svg) {
            svg.setAttribute("width", "12");
            svg.setAttribute("height", "12");
            svg.setAttribute("stroke", "#da1b1b");
        }
    }

    openProjectIconPicker(project: ProjectCatalogEntry) {
        if (!project || !project.name) return;
        new ProjectIconPickerModal(this.app, this, project, async (iconName) => {
            await this.setProjectIconName(project.id, project.name, iconName);
            this.refreshTaskView();
        }).open();
    }

    openProjectContextMenu(project: ProjectCatalogEntry, event: MouseEvent) {
        if (!project || !project.name) return;
        const menu = new Menu();
        menu.setUseNativeMenu(false);
        menu.addItem((item) => {
            item.setTitle("设置项目图标")
                .setIcon("folder")
                .onClick(() => this.openProjectIconPicker(project));
        });
        const hidden = this.isProjectHidden(project.id, project.name);
        menu.addItem((item) => {
            item.setTitle(hidden ? "在侧边栏显示" : "从侧边栏隐藏")
                .setIcon(hidden ? "eye" : "eye-off")
                .onClick(() => this.setProjectHidden(project.id, project.name, !hidden));
        });
        menu.addItem((item) => {
            item.setTitle("新增项目标题")
                .setIcon("plus")
                .onClick(() => this.openProjectCreateModal());
        });
        const isInbox = this.isInboxProject(project.id, project.name);
        menu.addItem((item) => {
            item.setTitle(isInbox ? "收集箱不支持修改标题" : "修改项目标题")
                .setIcon("pencil")
                .setDisabled(isInbox)
                .onClick(() => this.openProjectRenameModal(project));
        });
        const deleteState = this.getProjectDeleteState(project);
        menu.addItem((item) => {
            item.setTitle(deleteState.reason)
                .setIcon("trash")
                .setDisabled(deleteState.disabled)
                .onClick(() => this.openProjectDeleteModal(project));
        });
        menu.showAtMouseEvent(event);
    }

    openProjectCreateModal() {
        new ProjectCreateModal(this.app, (name) => {
            this.createProjectInBackground(name);
        }).open();
    }

    openProjectDeleteModal(project: ProjectCatalogEntry) {
        const state = this.getProjectDeleteState(project);
        if (state.disabled) {
            new Notice(state.reason);
            return;
        }
        new ProjectDeleteConfirmModal(this.app, project, () => {
            this.deleteProjectInBackground(project);
        }).open();
    }

    createProjectInBackground(name: string) {
        setTimeout(async () => {
            try {
                await this.createProject(name);
            } catch (e: any) {
                new Notice(e?.message || "新增项目标题失败");
            }
        }, 0);
    }

    async createProject(name: string) {
        const trimmed = (name || "").trim();
        if (!trimmed) {
            new Notice("项目标题不能为空");
            return;
        }
        if (this.findProjectByName(trimmed)) throw new Error("已存在同名项目标题");
        const project: ProjectCatalogEntry = {
            id: this.generateTemporaryProjectId(),
            name: trimmed,
            isArchived: false,
            isLocalOnly: true
        };
        await this.applyLocalProjectCreate(project);
        this.refreshTaskView();
        if (this.settings.accessToken) this.syncCreatedProjectInBackground(project);
        else new Notice("项目标题已新增，当前未认证，暂未同步到滴答清单");
    }

    syncCreatedProjectInBackground(project: ProjectCatalogEntry) {
        setTimeout(async () => {
            try {
                await this.ensureRemoteProjectExists(project);
                this.refreshTaskView();
                new Notice("项目标题已同步到滴答清单");
            } catch (e: any) {
                new Notice(e?.message || "项目标题已新增，但同步到滴答清单失败");
            }
        }, 0);
    }

    async createRemoteProject(name: string) {
        const res = await this.apiClient.makeAuthenticatedRequest(
            "https://api.dida365.com/open/v1/project",
            { method: "POST", body: JSON.stringify({ name }) }
        );
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`创建滴答项目失败: ${res.status}${text ? " " + text : ""}`);
        }
        const data = await res.json().catch(() => null);
        if (data && data.id) return data;
        throw new Error("创建滴答项目失败: 未返回有效的项目ID");
    }

    async ensureRemoteProjectExists(project: ProjectCatalogEntry) {
        if (!project || !project.name) throw new Error("项目标题不能为空");
        const known = (project.id && this.getProjectCatalog().find((item) => item.id === project.id)) || project;
        if (!this.settings.accessToken) throw new Error("请先完成OAuth认证后再同步项目标题到滴答清单");
        if (!this._projectCreationPromises) this._projectCreationPromises = new Map();
        const key = known.id || `name:${known.name.trim().toLowerCase()}`;
        if (this._projectCreationPromises.has(key)) return this._projectCreationPromises.get(key);
        const task = (async () => {
            const created = await this.createRemoteProject(known.name);
            await this.finalizeLocalProjectCreation(known, created);
            return created;
        })();
        this._projectCreationPromises.set(key, task);
        try {
            return await task;
        } finally {
            this._projectCreationPromises.delete(key);
        }
    }

    async applyLocalProjectCreate(project: ProjectCatalogEntry) {
        if (!Array.isArray(this.settings.projectCatalog)) this.settings.projectCatalog = [];
        this.settings.projectCatalog = this.normalizeProjectCatalog([
            ...this.settings.projectCatalog,
            project
        ]);
        if (!Array.isArray(this.settings.projectOrder)) this.settings.projectOrder = [];
        if (!this.settings.projectOrder.includes(project.name)) this.settings.projectOrder.push(project.name);
        await this.saveSettings();
    }

    async finalizeLocalProjectCreation(project: ProjectCatalogEntry, remote: DidaProject) {
        const id = typeof remote?.id === "string" ? remote.id.trim() : "";
        const name = typeof remote?.name === "string" && remote.name.trim() ? remote.name.trim() : project.name;
        this.settings.projectCatalog = this.getProjectCatalog().map((entry) =>
            entry.id === project.id || entry.name === project.name
                ? { id, name, isArchived: remote?.closed === true, isLocalOnly: false }
                : entry
        );
        (Array.isArray(this.settings.tasks) ? this.settings.tasks : []).forEach((task) => {
            if (!task) return;
            if (task.projectId !== project.id && task.projectName !== project.name) return;
            task.projectId = id;
            task.projectName = name;
        });
        if (this.settings.projectIcons) {
            const oldKey = this.getProjectIconConfigKey(project.id, project.name);
            const newKey = this.getProjectIconConfigKey(id, name);
            if (this.settings.projectIcons[oldKey]) {
                this.settings.projectIcons[newKey] = this.settings.projectIcons[oldKey];
                delete this.settings.projectIcons[oldKey];
            }
        }
        await this.saveSettings();
    }

    createProjectDeletionSnapshot(project: ProjectCatalogEntry) {
        return {
            projectCatalog: this.getProjectCatalog(),
            projectOrder: Array.isArray(this.settings.projectOrder) ? [...this.settings.projectOrder] : [],
            projectCollapsedStates: { ...(this.settings.projectCollapsedStates || {}) },
            projectIcons: { ...(this.settings.projectIcons || {}) },
            projectName: project?.name || "",
            projectId: project?.id || ""
        };
    }

    async restoreDeletedProject(snapshot: any) {
        if (!snapshot) return;
        this.settings.projectCatalog = this.normalizeProjectCatalog(snapshot.projectCatalog || []);
        this.settings.projectOrder = Array.isArray(snapshot.projectOrder) ? [...snapshot.projectOrder] : [];
        this.settings.projectCollapsedStates = { ...(snapshot.projectCollapsedStates || {}) };
        this.settings.projectIcons = { ...(snapshot.projectIcons || {}) };
        await this.saveSettings();
    }

    mergeRemoteProjectsIntoCatalog(projectMap: Map<string, DidaProject>) {
        const current = this.getProjectCatalog();
        const locals = current.filter((entry) => entry.isLocalOnly === true);
        const next = [...locals];
        const seen = new Set(locals.map((entry) => entry.id
            ? `id:${entry.id.toLowerCase()}`
            : `name:${entry.name.trim().toLowerCase()}`));
        if (projectMap instanceof Map) {
            projectMap.forEach((value) => {
                const entry = this.normalizeProjectCatalogEntry({
                    id: value?.id || "",
                    name: value?.name || "",
                    isArchived: value?.closed === true,
                    isLocalOnly: false
                });
                if (!entry) return;
                const key = entry.id ? `id:${entry.id.toLowerCase()}` : `name:${entry.name.trim().toLowerCase()}`;
                if (seen.has(key)) return;
                seen.add(key);
                next.push(entry);
            });
        }
        const normalizedCurrent = this.normalizeProjectCatalog(current);
        const normalizedNext = this.normalizeProjectCatalog(next);
        if (JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizedNext)) {
            this.settings.projectCatalog = normalizedNext;
            return true;
        }
        this.settings.projectCatalog = normalizedCurrent;
        return false;
    }

    deleteProjectInBackground(project: ProjectCatalogEntry) {
        setTimeout(async () => {
            try {
                await this.deleteProject(project);
            } catch (e: any) {
                new Notice(e?.message || "删除项目标题失败");
            }
        }, 0);
    }

    async deleteProject(project: ProjectCatalogEntry) {
        if (!project || !project.name) return;
        const state = this.getProjectDeleteState(project);
        if (state.disabled) throw new Error(state.reason);
        const isTemporary = this.isTemporaryProjectId(project.id) || project.isLocalOnly === true;
        const shouldSync = !isTemporary && !this.isInboxProject(project.id, project.name) && !!this.settings.accessToken;
        const snapshot = this.createProjectDeletionSnapshot(project);
        await this.applyLocalProjectDelete(project);
        this.refreshTaskView();
        if (shouldSync) {
            try {
                let projectId = project.id;
                if (!isTemporary && !projectId) {
                    const created = await this.ensureRemoteProjectExists(project);
                    projectId = created?.id || "";
                }
                if (projectId) await this.deleteRemoteProject(projectId);
            } catch (e) {
                await this.restoreDeletedProject(snapshot);
                this.refreshTaskView();
                throw e;
            }
            new Notice("项目标题已同步从滴答清单删除");
            return;
        }
        if (!this.settings.accessToken && project.id && !isTemporary && !this.isInboxProject(project.id, project.name)) {
            await this.restoreDeletedProject(snapshot);
            this.refreshTaskView();
            throw new Error("请先完成OAuth认证后再删除滴答项目标题");
        }
        new Notice("项目标题已删除");
    }

    async applyLocalProjectDelete(project: ProjectCatalogEntry) {
        const id = typeof project.id === "string" ? project.id.trim() : "";
        const name = project.name;
        this.settings.projectCatalog = this.getProjectCatalog().filter((entry) => {
            if (!entry) return false;
            if (id && entry.id === id) return false;
            if (entry.name === name) return false;
            return true;
        });
        if (Array.isArray(this.settings.projectOrder)) {
            this.settings.projectOrder = this.settings.projectOrder.filter((value) => value !== name);
        }
        if (this.settings.projectCollapsedStates && Object.prototype.hasOwnProperty.call(this.settings.projectCollapsedStates, name)) {
            delete this.settings.projectCollapsedStates[name];
        }
        if (this.settings.projectIcons) {
            const idKey = this.getProjectIconConfigKey(id, name);
            const nameKey = this.getProjectIconConfigKey("", name);
            delete this.settings.projectIcons[idKey];
            delete this.settings.projectIcons[nameKey];
        }
        if (Array.isArray(this.settings.hiddenProjectKeys)) {
            const idKey = this.getProjectFilterKey(id, name);
            const nameKey = this.getProjectFilterKey("", name);
            this.settings.hiddenProjectKeys = this.settings.hiddenProjectKeys.filter((value) => value !== idKey && value !== nameKey);
        }
        await this.saveSettings();
    }

    async deleteRemoteProject(projectId: string) {
        const res = await this.apiClient.makeAuthenticatedRequest(
            `https://api.dida365.com/open/v1/project/${projectId}`,
            { method: "DELETE" }
        );
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`删除滴答项目失败: ${res.status}${text ? " " + text : ""}`);
        }
    }

    openProjectRenameModal(project: ProjectCatalogEntry) {
        if (!project || !project.name) return;
        new ProjectRenameModal(this.app, project, (name) => {
            this.renameProjectInBackground(project, name);
        }).open();
    }

    renameProjectInBackground(project: ProjectCatalogEntry, name: string) {
        setTimeout(async () => {
            try {
                await this.renameProject(project, name);
            } catch (e: any) {
                new Notice(e?.message || "修改项目标题失败");
            }
        }, 0);
    }

    async renameProject(project: ProjectCatalogEntry, name: string) {
        if (!project || !project.name) return;
        const next = (name || "").trim();
        if (!next) {
            new Notice("项目标题不能为空");
            return;
        }
        if (next === project.name) return;
        const isInbox = this.isInboxProject(project.id, project.name);
        const isTemporary = this.isTemporaryProjectId(project.id) || project.isLocalOnly === true;
        const shouldSync = !!project.id && !isInbox && !isTemporary;
        const previousName = project.name;
        await this.applyLocalProjectRename(project, next);
        this.refreshTaskView();
        if (shouldSync) {
            if (!this.settings.accessToken) {
                await this.applyLocalProjectRename({ ...project, name: next }, previousName);
                this.refreshTaskView();
                throw new Error("请先完成OAuth认证后再修改滴答项目标题");
            }
            try {
                await this.renameRemoteProject(project.id, next);
            } catch (e) {
                await this.applyLocalProjectRename({ ...project, name: next }, previousName);
                this.refreshTaskView();
                throw e;
            }
            new Notice("项目标题已同步到滴答清单");
        } else {
            new Notice("项目标题已更新");
        }
    }

    async renameRemoteProject(projectId: string, name: string) {
        const res = await this.apiClient.makeAuthenticatedRequest(
            `https://api.dida365.com/open/v1/project/${projectId}`,
            { method: "POST", body: JSON.stringify({ name }) }
        );
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`修改滴答项目标题失败: ${res.status}${text ? " " + text : ""}`);
        }
    }

    async applyLocalProjectRename(project: ProjectCatalogEntry, nextName: string) {
        const oldName = project.name;
        const id = project.id || "";
        const hasId = !!id && id !== "inbox";
        (Array.isArray(this.settings.tasks) ? this.settings.tasks : []).forEach((task) => {
            if (!task) return;
            const byId = hasId && task.projectId === id;
            const byName = !hasId && task.projectName === oldName;
            if (byId || byName) task.projectName = nextName;
        });
        if (this.settings.projectCollapsedStates && Object.prototype.hasOwnProperty.call(this.settings.projectCollapsedStates, oldName)) {
            this.settings.projectCollapsedStates[nextName] = this.settings.projectCollapsedStates[oldName];
            delete this.settings.projectCollapsedStates[oldName];
        }
        if (Array.isArray(this.settings.projectOrder)) {
            this.settings.projectOrder = this.settings.projectOrder.map((value) => value === oldName ? nextName : value);
        }
        if (!hasId && Array.isArray(this.settings.hiddenProjectKeys)) {
            const oldKey = this.getProjectFilterKey("", oldName);
            const newKey = this.getProjectFilterKey("", nextName);
            this.settings.hiddenProjectKeys = this.settings.hiddenProjectKeys.map((value) => value === oldKey ? newKey : value);
        }
        if (!hasId && this.settings.projectIcons) {
            const oldKey = this.getProjectIconConfigKey("", oldName);
            const newKey = this.getProjectIconConfigKey("", nextName);
            if (this.settings.projectIcons[oldKey]) {
                this.settings.projectIcons[newKey] = this.settings.projectIcons[oldKey];
                delete this.settings.projectIcons[oldKey];
            }
        }
        if (Array.isArray(this.settings.projectCatalog)) {
            this.settings.projectCatalog = this.getProjectCatalog().map((entry) => {
                const matchById = hasId && entry.id === id;
                const matchByName = !hasId && entry.name === oldName;
                return matchById || matchByName ? { ...entry, name: nextName } : entry;
            });
        }
        await this.saveSettings();
    }

    getAvailableProjectConfigs() {
        const map = new Map<string, ProjectCatalogEntry>();
        [...this.getProjectCatalog(), ...this.getTaskDerivedProjects()].forEach((entry) => {
            if (!entry || !entry.name) return;
            const key = this.getProjectIconConfigKey(entry.id, entry.name);
            if (!map.has(key)) {
                map.set(key, {
                    id: entry.id || "",
                    name: entry.name,
                    isArchived: entry.isArchived === true,
                    isLocalOnly: entry.isLocalOnly === true
                });
            }
        });
        return Array.from(map.values()).sort((a, b) =>
            a.name === "收集箱" ? -1 : b.name === "收集箱" ? 1 : a.name.localeCompare(b.name)
        );
    }

    findProjectById(projectId: string) {
        const target = typeof projectId === "string" ? projectId.trim() : "";
        if (!target) return null;
        return this.getAvailableProjectConfigs().find((entry) => entry?.id === target) || null;
    }

    getProjectDisplayInfo(projectId: string, fallbackName?: string) {
        const normalizedId = typeof projectId === "string" && projectId.trim() ? projectId.trim() : "inbox";
        const project = this.findProjectById(normalizedId);
        const cached = (this.settings.projects || []).find((item) => item.id === normalizedId);
        const name = project?.name || cached?.name || fallbackName || (normalizedId === "inbox" ? "收集箱" : normalizedId);
        return {
            id: normalizedId,
            name,
            color: cached?.color,
            closed: cached?.closed,
            viewMode: cached?.viewMode,
            kind: cached?.kind,
            permission: cached?.permission,
            isLocalOnly: project?.isLocalOnly === true
        };
    }

    formatDidaDateTime(date: Date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        const h = String(date.getHours()).padStart(2, "0");
        const min = String(date.getMinutes()).padStart(2, "0");
        const s = String(date.getSeconds()).padStart(2, "0");
        const ms = String(date.getMilliseconds()).padStart(3, "0");
        const offset = date.getTimezoneOffset();
        const oh = Math.abs(Math.floor(offset / 60));
        const om = Math.abs(offset % 60);
        const tz = (offset <= 0 ? "+" : "-") + String(oh).padStart(2, "0") + String(om).padStart(2, "0");
        return `${y}-${m}-${d}T${h}:${min}:${s}.${ms}${tz}`;
    }

    buildDefaultCompletedTaskQuery(): CompletedTasksQuery {
        const end = new Date();
        const start = new Date(end);
        start.setDate(end.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return {
            startDate: this.formatDidaDateTime(start),
            endDate: this.formatDidaDateTime(end)
        };
    }

    normalizeRemoteTask(task: any, project: any = null): DidaTask {
        let content = task.content || "";
        let desc = task.desc || "";
        if (task.items && Array.isArray(task.items) && task.items.length > 0) {
            const merged = content || desc || "";
            content = merged;
            desc = merged;
        }
        const display = this.getProjectDisplayInfo(task.projectId || project?.id || "inbox", task.projectName || project?.name);
        return {
            id: task.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: task.title || "",
            content,
            desc,
            didaId: task.id,
            projectId: display.id,
            projectName: display.name,
            createdAt: task.createdTime || new Date().toISOString(),
            updatedAt: task.modifiedTime || task.updatedAt || new Date().toISOString(),
            dueDate: task.dueDate || null,
            startDate: task.startDate || null,
            etag: task.etag || null,
            isAllDay: task.isAllDay === true,
            kind: task.kind || "TEXT",
            reminders: task.reminders || [],
            repeatFlag: task.repeatFlag || null,
            status: task.status || 0,
            completed: task.status === 2,
            completedTime: task.completedTime || null,
            projectColor: task.projectColor || project?.color || display.color,
            projectClosed: task.projectClosed ?? project?.closed ?? display.closed,
            projectViewMode: task.projectViewMode || project?.viewMode || display.viewMode,
            projectKind: task.projectKind || project?.kind || display.kind,
            projectPermission: task.projectPermission || project?.permission || display.permission,
            parentId: task.parentId || null,
            items: task.items && Array.isArray(task.items) ? task.items.slice() : []
        };
    }

    async fetchCompletedTasks(query: CompletedTasksQuery = {}) {
        if (!this.settings.accessToken) throw new Error("请先进行OAuth认证");
        const finalQuery = {
            ...this.buildDefaultCompletedTaskQuery(),
            ...(query || {})
        };
        const remoteTasks = await this.apiClient.getCompletedTasks(finalQuery);
        this.settings.completedTasks = Array.isArray(remoteTasks)
            ? remoteTasks.map((task) => this.normalizeRemoteTask(task))
            : [];
        this.settings.completedTasksLastFetchedAt = new Date().toISOString();
        this.settings.completedTasksQuery = finalQuery;
        await this.saveSettings();
        this.refreshTaskView();
        new Notice(`已获取 ${this.settings.completedTasks.length} 个已完成任务`);
        return this.settings.completedTasks;
    }

    showCompletedTasksModal() {
        new CompletedTasksModal(this.app, this).open();
    }

    showTaskNoteSyncModal() {
        new TaskNoteSyncModal(this.app, this).open();
    }

    async restoreCompletedTask(task: DidaTask) {
        if (!task?.didaId) throw new Error("任务缺少滴答清单 ID，无法恢复");
        if (!this.settings.accessToken) throw new Error("请先进行OAuth认证");

        const didaId = task.didaId;
        const existingIndex = this.settings.tasks.findIndex((item) => item.didaId === didaId);
        const existingTask = existingIndex >= 0 ? this.settings.tasks[existingIndex] : null;
        const project = this.findProjectById(task.projectId || "inbox");
        const display = this.getProjectDisplayInfo(task.projectId || project?.id || "inbox", task.projectName || project?.name);
        const now = new Date().toISOString();

        const restoredTask: DidaTask = existingTask
            ? {
                ...existingTask,
                title: task.title || existingTask.title,
                content: task.content || existingTask.content,
                desc: task.desc || existingTask.desc,
                dueDate: task.dueDate || existingTask.dueDate || null,
                startDate: task.startDate || existingTask.startDate || null,
                reminders: task.reminders || existingTask.reminders || [],
                repeatFlag: task.repeatFlag || existingTask.repeatFlag || null,
                items: task.items || existingTask.items || [],
                isAllDay: task.isAllDay ?? existingTask.isAllDay ?? false,
                status: 0,
                completed: false,
                completedTime: null,
                updatedAt: now,
                projectId: display.id,
                projectName: display.name,
                projectColor: task.projectColor || existingTask.projectColor || display.color,
                projectClosed: task.projectClosed ?? existingTask.projectClosed ?? display.closed,
                projectViewMode: task.projectViewMode || existingTask.projectViewMode || display.viewMode,
                projectKind: task.projectKind || existingTask.projectKind || display.kind,
                projectPermission: task.projectPermission || existingTask.projectPermission || display.permission
            }
            : {
                ...this.normalizeRemoteTask({
                    ...task,
                    id: didaId,
                    status: 0,
                    completedTime: null
                }, project),
                didaId,
                status: 0,
                completed: false,
                completedTime: null,
                updatedAt: now,
                projectId: display.id,
                projectName: display.name,
                projectColor: task.projectColor || display.color,
                projectClosed: task.projectClosed ?? display.closed,
                projectViewMode: task.projectViewMode || display.viewMode,
                projectKind: task.projectKind || display.kind,
                projectPermission: task.projectPermission || display.permission
            };

        await this.updateTaskInDidaList(restoredTask);

        if (existingIndex >= 0) {
            this.settings.tasks[existingIndex] = restoredTask;
        } else {
            this.settings.tasks.push(restoredTask);
        }

        this.settings.completedTasks = this.settings.completedTasks.filter((item) => item.didaId !== didaId);
        await this.saveSettings();
        this.refreshTaskView();
        new Notice("任务已恢复为未完成");
        return restoredTask;
    }

    async moveTaskToProject(task: DidaTask, targetProjectId: string) {
        if (!task) throw new Error("任务不存在");
        const sourceProjectId = task.projectId || "inbox";
        const target = this.findProjectById(targetProjectId);
        if (!target || !target.id) throw new Error("目标项目不存在");
        if (target.isLocalOnly) throw new Error("目标项目尚未同步到滴答清单，无法移动");
        if (sourceProjectId === target.id) return task;

        if (task.didaId && this.settings.accessToken) {
            await this.apiClient.moveTask(sourceProjectId, target.id, task.didaId);
        }

        const display = this.getProjectDisplayInfo(target.id, target.name);
        task.projectId = display.id;
        task.projectName = display.name;
        task.projectColor = display.color;
        task.projectClosed = display.closed;
        task.projectViewMode = display.viewMode;
        task.projectKind = display.kind;
        task.projectPermission = display.permission;
        task.updatedAt = new Date().toISOString();
        await this.saveSettings();
        this.refreshTaskView();
        return task;
    }

    getLucideIconNames() {
        return DIDA_LUCIDE_ICON_NAMES.slice();
    }

    createStatusBarItem() {
        if (!this.statusBarItem) {
            this.statusBarItem = this.addStatusBarItem();
            this.updateStatusBar("未连接");
            this.statusBarItem.addEventListener("click", () => {
                if (this.settings.accessToken) {
                    this.openTaskViewWithCache();
                } else {
                    this.apiClient.startOAuthFlow();
                }
            });
        }
    }

    updateStatusBar(text: string) {
        if (this.statusBarItem) {
            let displayText = text;
            try {
                if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) {
                    displayText = "离线中";
                }
            } catch (e) { }
            this.statusBarItem.setText(`滴答清单: ${displayText}`);
        }
    }

    setupAutoSync() {
        this.clearAutoSync();
        if (this.settings.autoSync && this.settings.accessToken) {
            try {
                if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) return;
            } catch (e) { }
            this.scheduleNextAutoSync(60 * this.settings.syncInterval * 1000);
        }
    }

    scheduleNextAutoSync(delayMs: number) {
        if (this.autoSyncTimeout) {
            clearTimeout(this.autoSyncTimeout);
            this.autoSyncTimeout = null;
        }
        if (this.settings.autoSync && this.settings.accessToken) {
            const safeDelay = Math.max(0, Number(delayMs) || 0);
            this.autoSyncTimeout = window.setTimeout(() => {
                this.handleAutoSyncTick();
            }, safeDelay);
        }
    }

    isFocusedTaskDetailsEditorActive() {
        try {
            const active = document.activeElement;
            if (!active || !(active instanceof HTMLElement)) return false;
            if (!active.closest(".dida-task-details")) return false;
            if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
            if (active.tagName === "TEXTAREA") return true;
            if (active.tagName === "INPUT") {
                const type = (active.getAttribute("type") || "text").toLowerCase();
                return !["checkbox", "button", "submit", "reset", "radio", "range", "color"].includes(type);
            }
            if (active.isContentEditable) return true;
        } catch (e) { }
        return false;
    }

    async handleAutoSyncTick() {
        this.autoSyncTimeout = null;
        if (this.settings.autoSync && this.settings.accessToken) {
            try {
                if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) {
                    this._autoSyncDeferredSince = null;
                    return;
                }
            } catch (e) { }
            const now = Date.now();
            if (this.isFocusedTaskDetailsEditorActive()) {
                if (!this._autoSyncDeferredSince) this._autoSyncDeferredSince = now;
                let elapsed = now - this._autoSyncDeferredSince;
                if (elapsed < AUTO_SYNC_EDIT_PAUSE_MAX_MS) {
                    elapsed = AUTO_SYNC_EDIT_PAUSE_MAX_MS - elapsed;
                    this.scheduleNextAutoSync(Math.min(AUTO_SYNC_EDIT_RECHECK_MS, elapsed));
                    return;
                }
            }
            this._autoSyncDeferredSince = null;
            try {
                await this.syncManager.syncFromDidaList();
            } catch (e) {
            } finally {
                if (this.settings.autoSync && this.settings.accessToken) {
                    this.scheduleNextAutoSync(60 * this.settings.syncInterval * 1000);
                }
            }
        } else {
            this._autoSyncDeferredSince = null;
        }
    }

    clearAutoSync() {
        if (this.syncIntervalId) {
            window.clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
        if (this.autoSyncTimeout) {
            window.clearTimeout(this.autoSyncTimeout);
            this.autoSyncTimeout = null;
        }
        this._autoSyncDeferredSince = null;
    }

    async autoCleanCompletedTasks() {
        if (this.settings.autoCleanCompletedTasks) {
            const now = new Date();
            const months = this.settings.autoCleanInterval;
            const threshold = new Date(now);
            threshold.setMonth(threshold.getMonth() - months);
            const before = this.settings.tasks.filter(t => t.status === 2 && t.completedTime).filter(t => new Date(t.completedTime as string) < threshold);
            if (before.length > 0) {
                this.settings.tasks = this.settings.tasks.filter(t => t.status !== 2 || !t.completedTime || new Date(t.completedTime) >= threshold);
                await this.saveSettings();
                this.refreshTaskView();
            }
        }
    }

    async resetTaskData() {
        try {
            const count = this.settings.tasks.length;
            this.settings.tasks = [];
            await this.saveSettings();
            this.refreshTaskView();
            new Notice(`已清空 ${count} 个本地任务数据`);
            setTimeout(async () => {
                try {
                    new Notice("正在从滴答清单云端获取最新数据...");
                    await this.syncManager.syncFromDidaList();
                    const newCount = this.settings.tasks.length;
                    new Notice(`重置完成！已从云端获取 ${newCount} 个任务数据`);
                } catch (e) { }
            }, 1000);
        } catch (e) { }
    }

    initializePluginFeatures() {
        this.isPluginActivated = !!this.settings.accessToken;

        this.initializeMarkdownTaskLink();
        this.createStatusBarItem();
        this.setupAutoSync();

        this._handleOnlineForAutoSync = () => {
            try {
                if (this.settings.autoSync && this.settings.accessToken) {
                    this.setupAutoSync();
                    this.updateStatusBar("已连接");
                    this.refreshTaskView();
                    try {
                        this.safeManualSync();
                    } catch (e) { }
                }
            } catch (e) { }
        };
        this._handleOfflineForAutoSync = () => {
            try {
                this.clearAutoSync();
                this.updateStatusBar("离线中");
                this.refreshTaskView();
            } catch (e) { }
        };
        window.addEventListener("online", this._handleOnlineForAutoSync);
        window.addEventListener("offline", this._handleOfflineForAutoSync);

        this.registerEvent(this.app.workspace.on("layout-change", () => {
            const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
            if (this._cachedTaskLeaf && !leaves.includes(this._cachedTaskLeaf)) this._cachedTaskLeaf = null;
        }));

        this.registerEvent(this.app.vault.on("modify", async (file) => {
            if (!this._isUpdatingNativeTaskStatus && this.settings.enableNativeTaskSync && file.extension === "md") {
                const path = file.path;
                if (!this._nativeTaskSyncTimeouts) this._nativeTaskSyncTimeouts = new Map();
                if (this._nativeTaskSyncTimeouts.has(path)) {
                    clearTimeout(this._nativeTaskSyncTimeouts.get(path)!);
                }
                const timeoutId = window.setTimeout(async () => {
                    this._nativeTaskSyncTimeouts!.delete(path);
                    if (this._isUpdatingNativeTaskStatus) return;
                    try {
                        const content = await this.app.vault.read(file);
                        const nativeTasks = this.nativeTaskSyncManager.detectNativeTasks(content, file.path);
                        let changed = false;
                        for (const nativeTask of nativeTasks) {
                            if (nativeTask.hasLink && nativeTask.didaId) {
                                const task = this.settings.tasks.find(t => t.didaId === nativeTask.didaId);
                                if (task) {
                                    const newStatus = nativeTask.isCompleted ? 2 : 0;
                                    if (task.status !== newStatus) {
                                        if (newStatus === 2 && RRuleParser.hasRepeatRule(task)) {
                                            const idx = this.settings.tasks.findIndex(t => t.didaId === task.didaId);
                                            if (idx !== -1) {
                                                try {
                                                    this._isUpdatingNativeTaskStatus = true;
                                                    await this.toggleTask(idx);
                                                    changed = true;
                                                } catch (e) {
                                                    this.updateTaskStatusDirectly(task, newStatus);
                                                    changed = true;
                                                } finally {
                                                    this._isUpdatingNativeTaskStatus = false;
                                                }
                                            }
                                        } else {
                                            this.updateTaskStatusDirectly(task, newStatus);
                                            changed = true;
                                            if (this.settings.accessToken) {
                                                setTimeout(async () => {
                                                    try {
                                                        await this.toggleTaskInDidaList(task);
                                                    } catch (e) { }
                                                }, 0);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (changed) {
                            await this.saveSettings();
                            this.refreshTaskView();
                        }
                    } catch (e) {
                        if (!this._lastErrorTime || Date.now() - this._lastErrorTime > 30000) {
                            this._lastErrorTime = Date.now();
                        }
                    }
                }, 2000);
                this._nativeTaskSyncTimeouts.set(path, timeoutId);
            }
        }));

        if (this.settings.accessToken) {
            setTimeout(async () => {
                try {
                    await this.safeManualSync();
                } catch (e) { }
            }, 2000);
        }
        if (this.settings.autoCleanCompletedTasks) {
            setTimeout(async () => {
                try {
                    await this.autoCleanCompletedTasks();
                } catch (e) { }
            }, 30000);
        }
    }

    async checkPluginStatusAndNotify(): Promise<boolean> {
        if (!this.settings.accessToken) {
            new Notice("请先在设置中配置Dida Sync插件");
            return false;
        }
        return true;
    }

    async manualSync() {
        if (await this.checkPluginStatusAndNotify()) {
            try {
                this.updateStatusBar("双向同步中...");
                await this.syncManager.syncToDidaList();
                await this.syncManager.syncFromDidaList();
            } catch (e) { }
        }
    }

    async safeManualSync() {
        if (await this.checkPluginStatusAndNotify()) {
            try {
                this.updateStatusBar("双向同步中...");
                await this.syncManager.syncNewTasksToDidaList();
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.syncManager.syncFromDidaList();
            } catch (e) { }
        }
    }

    // Proxy methods to SyncManager
    async syncFromDidaList() {
        await this.syncManager.syncFromDidaList();
    }

    async syncToDidaList() {
        await this.syncManager.syncToDidaList();
    }

    async syncNewTasksToDidaList() {
        await this.syncManager.syncNewTasksToDidaList();
    }

    async createTaskInDidaList(task: DidaTask) {
        return this.syncManager.createTaskInDidaList(task);
    }

    async updateTaskInDidaList(task: DidaTask) {
        return this.syncManager.updateTaskInDidaList(task);
    }

    async deleteTaskInDidaList(task: DidaTask) {
        return this.syncManager.deleteTaskInDidaList(task.didaId as string, task.projectId || "inbox");
    }

    async toggleTaskInDidaList(task: DidaTask) {
        return this.syncManager.toggleTaskInDidaList(task);
    }

    async syncTaskToDidaListInBackground(task: DidaTask) {
        if (this.settings.accessToken && task.didaId) {
            try {
                await this.updateTaskInDidaList(task);
            } catch (e) { }
        }
    }

    // View Management
    async openTaskViewWithCache() {
        const workspace = this.app.workspace;
        const cachedLeafAvailable = this._cachedTaskLeaf && workspace.getLeavesOfType(TASK_VIEW_TYPE).includes(this._cachedTaskLeaf);
        if (cachedLeafAvailable && this._cachedTaskLeaf) {
            workspace.revealLeaf(this._cachedTaskLeaf);
        } else {
            let leaf = null;
            const leaves = workspace.getLeavesOfType(TASK_VIEW_TYPE);
            if (leaves.length > 0) {
                leaf = leaves[0];
            } else {
                leaf = workspace.getRightLeaf(false);
                if (leaf) {
                    await leaf.setViewState({ type: TASK_VIEW_TYPE, active: true });
                }
            }
            if (leaf) {
                this._cachedTaskLeaf = leaf;
                workspace.revealLeaf(leaf);
                this.registerEvent(leaf.on("close", () => {
                    if (this._cachedTaskLeaf === leaf) this._cachedTaskLeaf = null;
                }));
            }
        }
        if (this.settings.accessToken) {
            await this.syncManager.syncFromDidaList();
        }
    }

    refreshTaskView() {
        const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
        leaves.forEach(leaf => {
            if (leaf.view instanceof TaskView) {
                leaf.view.renderTaskList();
            }
        });

        // Also refresh timeline view if open (it's a modal, handled internally or via re-render)
    }

    showTimelineView() {
        if (this.isPluginActivated) {
            try {
                if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) {
                    new Notice("当前处于离线状态，时间线视图不可用");
                    return;
                }
            } catch (e) { }
            new TimelineViewModal(this.app, this).open();
        } else {
            this.checkPluginStatusAndNotify();
        }
    }

    showAddTaskToProjectModal(projectName?: string, projectId?: string, target?: HTMLElement) {
        if (this.isPluginActivated) {
            const modal = new AddTaskToProjectModal(this.app, this);
            modal.open();
        } else {
            this.checkPluginStatusAndNotify();
        }
    }

    // Task Management
    async addTask(title: string, projectName: string = "收集箱", projectId: string = "inbox", shouldSync: boolean = true, dueDate: string | null = null): Promise<DidaTask> {
        const newTask: DidaTask = {
            id: Date.now().toString(),
            title: title,
            content: "",
            completed: false,
            status: 0,
            didaId: null,
            projectId: projectId,
            projectName: projectName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: [],
            dueDate: dueDate || undefined,
            kind: "TEXT",
            priority: 0,
            sortOrder: 0,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            isFloating: false,
            isAllDay: false
        };

        this.settings.tasks = this.settings.tasks || [];
        this.settings.tasks.push(newTask);
        await this.saveSettings();
        this.refreshTaskView();

        if (shouldSync && this.settings.accessToken) {
            try {
                await this.createTaskInDidaList(newTask);
                this.refreshTaskView();
            } catch (e) {
                this.refreshTaskView();
            }
        }

        return newTask;
    }

    async updateTaskContent(index: number, content: string) {
        if (this.settings.tasks && !(index >= this.settings.tasks.length)) {
            const task = this.settings.tasks[index];
            task.content = content;
            task.updatedAt = new Date().toISOString();
            await this.saveSettings();
            if (this.settings.accessToken && task.didaId) {
                setTimeout(() => {
                    this.updateTaskContentInDidaList(task).catch(() => { });
                }, 0);
            }
        }
    }

    async updateTaskContentInDidaList(task: DidaTask) {
        if (task.didaId) {
            const payload: any = {
                id: task.didaId,
                title: task.title,
                content: task.content || "",
                desc: task.desc || "",
                status: task.status
            };
            if (task.items && Array.isArray(task.items) && task.items.length > 0) {
                const content = task.content || task.desc || "";
                payload.content = content;
                payload.desc = content;
            }
            if (task.projectId && task.projectId !== "inbox") payload.projectId = task.projectId;
            if (task.dueDate !== undefined) {
                if (task.dueDate === null) payload.dueDate = null;
                else if (task.dueDate.endsWith("Z")) payload.dueDate = task.dueDate.replace("Z", "+0000");
                else payload.dueDate = task.dueDate;
            }
            if (task.startDate) payload.startDate = task.startDate;
            if (task.isAllDay !== undefined) payload.isAllDay = task.isAllDay;
            if (task.priority !== undefined) payload.priority = task.priority;
            if (task.parentId) payload.parentId = task.parentId;
            if (task.items && Array.isArray(task.items)) payload.items = task.items;
            if (typeof task.repeatFlag === "string") {
                const rf = task.repeatFlag.trim();
                payload.repeatFlag = rf === "" ? "" : rf;
            }
            try {
                const res = await this.apiClient.makeAuthenticatedRequest("https://api.dida365.com/open/v1/task/" + task.didaId, {
                    method: "POST",
                    body: JSON.stringify(payload)
                } as any);
                if (!res.ok) {
                    await res.text();
                    throw new Error("更新任务失败: " + res.status);
                }
                task.updatedAt = new Date().toISOString();
                await this.saveSettings();
            } catch (e) {
                throw e;
            }
        }
    }

    async toggleTask(index: number) {
        const task = this.settings.tasks[index];
        if (task) {
            if (task.status === 2) {
                task.status = 0;
                task.completedTime = null;
                task.completed = false;
            } else {
                task.status = 2;
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, "0");
                const d = String(now.getDate()).padStart(2, "0");
                const h = String(now.getHours()).padStart(2, "0");
                const min = String(now.getMinutes()).padStart(2, "0");
                const s = String(now.getSeconds()).padStart(2, "0");
                const offset = now.getTimezoneOffset();
                const oh = Math.abs(Math.floor(offset / 60));
                const om = Math.abs(offset % 60);
                const tz = (offset <= 0 ? "+" : "-") + String(oh).padStart(2, "0") + String(om).padStart(2, "0");
                task.completedTime = `${y}-${m}-${d}T${h}:${min}:${s}${tz}`;
                task.completed = true;

            }

            task.updatedAt = new Date().toISOString();

            if (task.status === 2 && task.didaId) {
                for (const sub of this.settings.tasks.filter(t => t.parentId === task.didaId)) {
                    if (sub.status !== 2) {
                        sub.status = 2;
                        const now = new Date();
                        const y = now.getFullYear();
                        const m = String(now.getMonth() + 1).padStart(2, "0");
                        const d = String(now.getDate()).padStart(2, "0");
                        const h = String(now.getHours()).padStart(2, "0");
                        const min = String(now.getMinutes()).padStart(2, "0");
                        const s = String(now.getSeconds()).padStart(2, "0");
                        const offset = now.getTimezoneOffset();
                        const oh = Math.abs(Math.floor(offset / 60));
                        const om = Math.abs(offset % 60);
                        const tz = (offset <= 0 ? "+" : "-") + String(oh).padStart(2, "0") + String(om).padStart(2, "0");
                        sub.completedTime = `${y}-${m}-${d}T${h}:${min}:${s}${tz}`;
                        sub.updatedAt = new Date().toISOString();
                        if (this.settings.accessToken && sub.didaId) {
                            setTimeout(() => {
                                this.toggleTaskInDidaList(sub).catch(() => { });
                            }, 0);
                        }
                    }
                }
            }

            await this.saveSettings();
            const completedRepeatTask = task.status === 2 && RRuleParser.hasRepeatRule(task);
            if (this.settings.accessToken && task.didaId) {
                setTimeout(async () => {
                    try {
                        await this.toggleTaskInDidaList(task);
                        if (completedRepeatTask) {
                            await this.syncManager.syncFromDidaList();
                            setTimeout(() => {
                                this.syncManager.syncFromDidaList().catch(() => { });
                            }, 2000);
                        }
                    } catch (e) {
                        if (completedRepeatTask) {
                            new Notice("重复任务已在本地标记完成，但同步到滴答清单失败，请稍后手动同步");
                        }
                    }
                }, 0);
            } else if (completedRepeatTask) {
                new Notice("重复任务已在本地标记完成；未连接滴答清单，未自动生成下一次任务");
            }
            this.refreshTaskView();
            if (task.didaId) {
                setTimeout(() => {
                    const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
                    if (leaves.length > 0) {
                        const view = leaves[0].view as TaskView;
                        if (view && (view as any).updateNativeTaskStatus) {
                            (view as any).updateNativeTaskStatus(task, task.status === 2).catch(() => { });
                        }
                    }
                }, 500);
            }
        }
    }

    async deleteTask(index: number) {
        const task = this.settings.tasks[index];
        if (task) {
            this.settings.tasks.splice(index, 1);
            await this.saveSettings();
            this.refreshTaskView();

            if (this.settings.accessToken && task.didaId) {
                this.deleteTaskInDidaList(task).catch(console.error);
            }
        }
    }

    // Native Task Sync & Editor Integration
    initializeMarkdownTaskLink() {
        this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => {
            this.handleEditorChange(editor, info);
        }));
        this.registerEvent(this.app.workspace.on("click", (evt) => {
            this.handleTaskLinkClick(evt as MouseEvent);
        }));
        this.registerEvent(this.app.workspace.on("file-open", () => {
            this.setupDidaLinkHandler();
        }));
        this.setupDidaLinkHandler();
        this.registerObsidianProtocolHandler("dida-task", (params) => {
            let didaId: string | null = null;
            if (params.didaId) didaId = params.didaId;
            else if ((params as any).action) didaId = (params as any).action.split("/")[1];
            else if (typeof params === "string") didaId = (params as any).split("/").pop();
            if (didaId) this.openTaskDetails(didaId);
        });
    }

    handleEditorChange(editor: Editor, info: any) {
        try {
            if (editor && editor.getCursor && editor.getLine && !this._isUpdatingNativeTaskStatus) {
                const cursor = editor.getCursor();
                const line = editor.getLine(cursor.line);
                const prefix = line.substring(0, cursor.ch);
                if (prefix.endsWith("@@")) {
                    setTimeout(() => {
                        this.showTaskSuggestions(editor, cursor);
                    }, 10);
                }
                if (this.settings.enableNativeTaskSync) {
                    const parsedCalloutLine = parseTaskLine(line);
                    if (parsedCalloutLine && parsedCalloutLine.quotePrefix && parsedCalloutLine.didaId) {
                        const didaId = parsedCalloutLine.didaId;
                        const isCompleted = parsedCalloutLine.checkbox === "x";
                        const task = this.settings.tasks.find(t => t.didaId === didaId);
                        if (task) {
                            const status = isCompleted ? 2 : 0;
                            if (task.status !== status) {
                                if (this._taskStatusChangeTimeout) {
                                    clearTimeout(this._taskStatusChangeTimeout);
                                    this._taskStatusChangeTimeout = null;
                                }
                                this._taskStatusChangeTimeout = window.setTimeout(async () => {
                                    try {
                                        this._isUpdatingNativeTaskStatus = true;
                                        if (status === 2 && RRuleParser.hasRepeatRule(task)) {
                                            const idx = this.settings.tasks.findIndex(t => t.didaId === didaId);
                                            if (idx !== -1) await this.toggleTask(idx);
                                        } else {
                                            this.updateTaskStatusDirectly(task, status);
                                            await this.saveSettings();
                                            this.refreshTaskView();
                                            if (this.settings.accessToken) {
                                                setTimeout(async () => {
                                                    try {
                                                        await this.toggleTaskInDidaList(task);
                                                    } catch (e) { }
                                                }, 0);
                                            }
                                        }
                                    } catch (e) { }
                                    finally {
                                        this._isUpdatingNativeTaskStatus = false;
                                        this._taskStatusChangeTimeout = null;
                                    }
                                }, 300);
                            }
                        }
                    }
                    const completedMatch = line.match(/^(\s*)-\s\[x\]\s.*\[🔗Dida\]\(obsidian:\/\/dida-task\?didaId=([a-f0-9]+)\)/i);
                    const incompleteMatch = line.match(/^(\s*)-\s\[\s\]\s.*\[🔗Dida\]\(obsidian:\/\/dida-task\?didaId=([a-f0-9]+)\)/);
                    if (completedMatch || incompleteMatch) {
                        const didaId = (completedMatch || incompleteMatch)![2];
                        const isCompleted = !!completedMatch;
                        const task = this.settings.tasks.find(t => t.didaId === didaId);
                        if (task) {
                            const status = isCompleted ? 2 : 0;
                            if (task.status !== status) {
                                if (this._taskStatusChangeTimeout) {
                                    clearTimeout(this._taskStatusChangeTimeout);
                                    this._taskStatusChangeTimeout = null;
                                }
                                this._taskStatusChangeTimeout = window.setTimeout(async () => {
                                    try {
                                        this._isUpdatingNativeTaskStatus = true;
                                        if (status === 2 && RRuleParser.hasRepeatRule(task)) {
                                            const idx = this.settings.tasks.findIndex(t => t.didaId === didaId);
                                            if (idx !== -1) await this.toggleTask(idx);
                                        } else {
                                            this.updateTaskStatusDirectly(task, status);
                                            await this.saveSettings();
                                            this.refreshTaskView();
                                            if (this.settings.accessToken) {
                                                setTimeout(async () => {
                                                    try {
                                                        await this.toggleTaskInDidaList(task);
                                                    } catch (e) { }
                                                }, 0);
                                            }
                                        }
                                    } catch (e) { }
                                    finally {
                                        this._isUpdatingNativeTaskStatus = false;
                                        this._taskStatusChangeTimeout = null;
                                    }
                                }, 300);
                            }
                        }
                    }
                    if (this.taskActionMenuDebounceTimer) {
                        clearTimeout(this.taskActionMenuDebounceTimer);
                        this.taskActionMenuDebounceTimer = null;
                    }
                    const parsedTaskActionPrefix = parseTaskLine(prefix);
                    if (parsedTaskActionPrefix && parsedTaskActionPrefix.checkbox === " ") {
                        if (this.isTaskActionInProgress) return;
                        if (this.currentTaskActionMenu && this.currentTaskActionMenu.isOpen && this.currentTaskActionMenu.isSamePosition(editor, cursor)) return;
                        if (Date.now() - this.lastTaskMenuTriggerTime < 300) return;
                        this.taskActionMenuDebounceTimer = window.setTimeout(() => {
                            this.lastTaskMenuTriggerTime = Date.now();
                            this.showTaskActionMenu(editor, cursor);
                            this.taskActionMenuDebounceTimer = null;
                        }, 150);
                    } else if (this.currentTaskActionMenu && this.currentTaskActionMenu.isOpen) {
                        this.currentTaskActionMenu.close();
                        this.currentTaskActionMenu = null;
                    }
                }
                if (this.dateChangeDebounceTimer) {
                    clearTimeout(this.dateChangeDebounceTimer);
                    this.dateChangeDebounceTimer = null;
                }
                const dateRegex = /^(\s*)-\s\[\s\]\s*(.+)📅\s*(\d{4}-\d{2}-\d{2})(.*)$/;
                const match = line.match(dateRegex);
                if (match) {
                    const title = match[2].trim();
                    const dateStr = match[3];
                    const linkMatch = line.match(/\[🔗Dida\]\(obsidian:\/\/dida-task\?didaId=([a-f0-9]+)\)/);
                    if (linkMatch) {
                        const didaId = linkMatch[1];
                        if (!this.isTaskActionInProgress) {
                            this.dateChangeDebounceTimer = window.setTimeout(() => {
                                this.handleDateChange(didaId, dateStr, title);
                                this.dateChangeDebounceTimer = null;
                            }, 500);
                        }
                    }
                }
            }
        } catch (e) { }
    }

    showTaskSuggestions(editor: Editor, cursor: EditorPosition, onSelect?: (task: DidaTask) => void) {
        try {
            let activeView: any;
            const popup = new TaskSuggestionPopup(this.app, this, editor, cursor, (task) => {
                if (onSelect) {
                    onSelect(task);
                } else {
                    this.insertTaskLink(editor, cursor, task);
                }
            });
            const el = popup.element!;
            el.setCssStyles({
                position: "fixed",
                width: "400px",
                maxHeight: "300px",
                overflowY: "auto",
                zIndex: "1000",
                backgroundColor: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
                padding: "16px"
            });

            let editorDom: HTMLElement | null = null;
            if ((editor as any).cm && (editor as any).cm.dom) editorDom = (editor as any).cm.dom;
            else if ((editor as any).getInputField && typeof (editor as any).getInputField === "function") editorDom = (editor as any).getInputField();
            else if ((editor as any).dom) editorDom = (editor as any).dom;
            else {
                activeView = this.app.workspace.getActiveViewOfType("markdown");
                if (activeView && activeView.editor) editorDom = activeView.editor.cm?.dom || activeView.editor.dom;
            }

            let lineEl: HTMLElement | null = null;
            let fallbackTop = 100;
            let fallbackLeft = 10;

            if (editorDom) {
                const rect = editorDom.getBoundingClientRect();
                let top = rect.top;
                let left = rect.left;
                if ((editor as any).cm && (editor as any).cm.cursorCoords) {
                    try {
                        const coords = (editor as any).cm.cursorCoords(cursor, "page");
                        top = coords.top;
                        left = coords.left;
                    } catch (e) {
                        top = rect.top + 20 * cursor.line + 20;
                        left = rect.left + 20;
                    }
                } else {
                    top = rect.top + 20 * cursor.line + 20;
                    left = rect.left + 20;
                }
                fallbackTop = top;
                fallbackLeft = left;

                if ((editor as any).cm && (editor as any).cm.dom) {
                    try {
                        const lines = (editor as any).cm.dom.querySelectorAll(".cm-line");
                        const currentLine = editor.getLine(cursor.line);
                        let idx = -1;
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].textContent.trim() === currentLine.trim()) {
                                idx = i;
                                break;
                            }
                        }
                        if (idx === -1) {
                            for (let i = 0; i < lines.length; i++) {
                                if (lines[i].textContent.includes("@@")) {
                                    idx = i;
                                    break;
                                }
                            }
                        }
                        if (idx === -1) {
                            const targetLine = cursor.line;
                            let closest = -1;
                            let dist = Infinity;
                            for (let i = 0; i < lines.length; i++) {
                                const offsetTop = (lines[i] as HTMLElement).offsetTop;
                                const approxLine = Math.round(offsetTop / 32);
                                const diff = Math.abs(approxLine - targetLine);
                                if (diff < dist) {
                                    dist = diff;
                                    closest = i;
                                }
                            }
                            if (closest !== -1) idx = closest;
                        }
                        lineEl = idx >= 0 ? lines[idx] : (lines.length > 0 ? lines[0] : null);
                    } catch (e) { }
                }

                if (lineEl) {
                    const lineRect = lineEl.getBoundingClientRect();
                    el.setCssStyles({
                        left: `${lineRect.left}px`,
                        top: `${lineRect.bottom + 5}px`
                    });
                } else {
                    el.setCssStyles({
                        left: `${rect.left}px`,
                        top: `${rect.bottom + 5}px`
                    });
                }
                const popupRect = el.getBoundingClientRect();
                const winHeight = window.innerHeight;
                const winWidth = window.innerWidth;
                if (popupRect.bottom > winHeight) {
                    if (lineEl) {
                        const lineRect = lineEl.getBoundingClientRect();
                        const newTop = lineRect.top - popupRect.height - 5;
                        el.setCssStyles({ top: `${Math.max(10, newTop)}px` });
                    } else {
                        const newTop = top - popupRect.height - 5;
                        el.setCssStyles({ top: `${Math.max(10, newTop)}px` });
                    }
                }
                if (popupRect.right > winWidth) el.setCssStyles({ left: `${winWidth - popupRect.width - 10}px` });
                if (popupRect.left < 10) el.setCssStyles({ left: "10px" });
            } else {
                el.setCssStyles({
                    left: `${fallbackLeft}px`,
                    top: `${fallbackTop}px`
                });
            }
        } catch (e) { }
    }

    insertTaskLink(editor: Editor, cursor: EditorPosition, task: DidaTask) {
        const line = editor.getLine(cursor.line);
        let before = line.substring(0, cursor.ch);

        // Check if triggered by @@
        if (before.endsWith("@@")) {
            before = before.substring(0, cursor.ch - 2);
        }

        const after = line.substring(cursor.ch);
        const linkText = `[@@${task.title || "无标题任务"}](obsidian://dida-task?didaId=${task.didaId})`;
        editor.setLine(cursor.line, before + linkText + after);
        editor.setCursor({ line: cursor.line, ch: before.length + linkText.length });
    }

    linkTaskToLine(editor: Editor, cursor: EditorPosition, task: DidaTask) {
        const existingLine = editor.getLine(cursor.line);
        const existingParsed = parseTaskLine(existingLine);
        const fullTaskLine = formatTaskLineFromTask(task, existingParsed?.indent || "", existingParsed?.quotePrefix || "");
        editor.setLine(cursor.line, fullTaskLine);
        editor.setCursor({ line: cursor.line, ch: fullTaskLine.length });
    }

    showTaskActionMenu(editor: Editor, cursor: EditorPosition) {
        try {
            if (!this.settings.enableNativeTaskSync) return;
            if (this.currentTaskActionMenu && this.currentTaskActionMenu.isOpen && this.currentTaskActionMenu.isSamePosition(editor, cursor)) return;
            if (this.currentTaskActionMenu) {
                this.currentTaskActionMenu.close();
                this.currentTaskActionMenu = null;
            }
            const menu = new TaskActionMenu(this.app, this, editor, cursor, (action, data) => {
                this.handleTaskAction(editor, cursor, action, data);
            });
            this.currentTaskActionMenu = menu;
            menu.open();
        } catch (e) { }
    }

    async handleTaskAction(editor: Editor, cursor: EditorPosition, action: string, data: any) {
        try {
            this.isTaskActionInProgress = true;
            const line = editor.getLine(cursor.line);
            if (action === "sync") {
                await this.syncTaskToDidaList(editor, cursor, line);
            } else if (action === "date") {
                this.addDateToTask(editor, cursor, line, data.date);
            } else if (action === "priority") {
                await this.updateTaskLineMetadata(editor, cursor, line, {
                    priority: data.priority
                });
            } else if (action === "repeat") {
                await this.updateTaskLineMetadata(editor, cursor, line, {
                    repeatFlag: data.repeatFlag
                });
            } else if (action === "search") {
                this.showTaskSuggestions(editor, cursor, (task) => {
                    this.linkTaskToLine(editor, cursor, task);
                });
            } else if (action === "selectTask") {
                if (data && data.task) {
                    this.linkTaskToLine(editor, cursor, data.task);
                }
            }
            setTimeout(() => {
                this.isTaskActionInProgress = false;
            }, 500);
        } catch (e) {
            setTimeout(() => {
                this.isTaskActionInProgress = false;
            }, 100);
        }
    }

    async syncTaskToDidaList(editor: Editor, cursor: EditorPosition, line: string) {
        try {
            if (this.settings.accessToken) {
                const parsedLine = parseTaskLine(line);
                if (parsedLine) {
                    if (!parsedLine.title) {
                        new Notice("任务内容不能为空");
                        return;
                    }
                    if (parsedLine.didaId) {
                        new Notice("任务已同步，无需再次同步", 3000);
                        return;
                    }
                    const created = await this.createTaskDirectly(parsedLine.title, {
                        startDate: parsedLine.startDate as any,
                        dueDate: parsedLine.dueDate as any,
                        isAllDay: parsedLine.isAllDay,
                        priority: parsedLine.priority,
                        repeatFlag: parsedLine.repeatFlag as any
                    });
                    if (created && created.id) {
                        editor.setLine(cursor.line, formatTaskLine(line, { didaId: created.id }));
                        const task: DidaTask = {
                            id: Date.now().toString(),
                            title: parsedLine.title,
                            content: "",
                            completed: false,
                            status: 0,
                            didaId: created.id,
                            projectId: created.projectId || "inbox",
                            projectName: "收集箱",
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            items: [],
                            dueDate: created.dueDate || parsedLine.dueDate as any,
                            etag: created.etag || "",
                            completedTime: null,
                            startDate: created.startDate || parsedLine.startDate as any,
                            isAllDay: created.isAllDay ?? parsedLine.isAllDay,
                            kind: created.kind || "TEXT",
                            projectViewMode: "list",
                            projectKind: "TASK",
                            reminders: [],
                            repeatFlag: created.repeatFlag || parsedLine.repeatFlag as any,
                            priority: created.priority ?? parsedLine.priority,
                            desc: "",
                            projectColor: "#F18181",
                            projectClosed: false,
                            projectPermission: "write",
                            parentId: null
                        };
                        this.settings.tasks.push(task);
                        await this.saveSettings();
                        new Notice("任务已同步到滴答清单", 3000);
                        this.refreshTaskView();
                    } else {
                        new Notice("同步失败，请重试");
                    }
                    return;
                }
                const match = line.match(/^(\s*)-\s\[\s\]\s*(.+)$/);
                if (match) {
                    const indent = match[1];
                    let content = match[2].trim();
                    if (content) {
                        const linkRegex = /\[🔗Dida\]\(obsidian:\/\/dida-task\?didaId=([^)]+)\)/;
                        const linkMatch = content.match(linkRegex);
                        if (linkMatch) {
                            new Notice("ℹ️ 任务已同步，无需再次同步", 3000);
                        } else {
                            let title = content;
                            title = title.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, "").trim();
                            title = title.replace(/\[🔗[^\]]*\]\([^)]*\)/g, "").trim();
                            title = title.replace(/\[[^\]]*\]\([^)]*\)/g, "").trim();
                            title = title.replace(/\s+/g, " ").trim();
                            if (title) {
                                const created = await this.createTaskDirectly(title);
                                if (created && created.id) {
                                    const newLine = indent + `- [ ] ${content} [🔗Dida](${`obsidian://dida-task?didaId=${created.id}`}) `;
                                    editor.setLine(cursor.line, newLine);
                                    const task: DidaTask = {
                                        id: Date.now().toString(),
                                        title: title,
                                        content: "",
                                        completed: false,
                                        status: 0,
                                        didaId: created.id,
                                        projectId: created.projectId || "inbox",
                                        projectName: "收集箱",
                                        createdAt: new Date().toISOString(),
                                        updatedAt: new Date().toISOString(),
                                        items: [],
                                        dueDate: null as any,
                                        etag: created.etag || "",
                                        completedTime: null,
                                        startDate: null as any,
                                        isAllDay: false,
                                        kind: "TEXT",
                                        projectViewMode: "list",
                                        projectKind: "TASK",
                                        reminders: [],
                                        repeatFlag: null as any,
                                        desc: "",
                                        projectColor: "#F18181",
                                        projectClosed: false,
                                        projectPermission: "write",
                                        parentId: null
                                    };
                                    this.settings.tasks.push(task);
                                    await this.saveSettings();
                                    new Notice("✅ 任务已同步到滴答清单", 3000);
                                    this.refreshTaskView();
                                } else {
                                    new Notice("❌ 同步失败，请重试");
                                }
                            }
                        }
                    } else {
                        new Notice("❌ 任务内容不能为空");
                    }
                } else {
                    new Notice("❌ 无法识别任务格式");
                }
            } else {
                new Notice("❌ 请先进行OAuth认证");
            }
        } catch (e: any) {
            let msg = "同步失败";
            if (e.message?.includes("401")) msg = "未经授权";
            else if (e.message?.includes("403")) msg = "禁止访问";
            else if (e.message?.includes("404")) msg = "未找到";
            else if (e.message) msg = "同步失败: " + e.message;
            new Notice("❌ " + msg, 5000);
        }
    }

    async createTaskDirectly(title: string, metadata: Partial<DidaTask> = {}) {
        const data: any = {
            title: title,
            content: "",
            desc: ""
        };
        if (metadata.startDate !== undefined) data.startDate = metadata.startDate;
        if (metadata.dueDate !== undefined) data.dueDate = metadata.dueDate;
        if (metadata.isAllDay !== undefined) data.isAllDay = metadata.isAllDay;
        if (metadata.priority !== undefined) data.priority = metadata.priority;
        if (typeof metadata.repeatFlag === "string") data.repeatFlag = metadata.repeatFlag;
        try {
            const res = await this.apiClient.makeAuthenticatedRequest("https://api.dida365.com/open/v1/task", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            } as any);
            if (res.ok) return await res.json();
            const errText = await res.text();
            throw new Error(`API调用失败: ${res.status} - ${errText}`);
        } catch (e) {
            throw e;
        }
    }

    async addDateToTask(editor: Editor, cursor: EditorPosition, line: string, date: string) {
        try {
            const parsedLine = parseTaskLine(line);
            if (parsedLine) {
                await this.updateTaskLineMetadata(editor, cursor, line, {
                    dueDate: makeLocalDateTime(date, 0, 0),
                    isAllDay: true
                });
                return;
            }
            const match = line.match(/^(\s*)-\s\[\s\]\s*(.+)$/);
            if (match) {
                const indent = match[1];
                const content = match[2].trim();
                const dateRegex = /📅\s*\d{4}-\d{2}-\d{2}/;
                const hasDate = dateRegex.test(content);
                const linkRegex = /\[🔗Dida\]\(obsidian:\/\/dida-task\?didaId=([^)]+)\)/;
                const linkMatch = content.match(linkRegex);
                if (linkMatch) {
                    const newLine = hasDate ? indent + "- [ ] " + content.replace(dateRegex, `📅 ${date} `) : indent + `- [ ] ${content} 📅 ${date} `;
                    editor.setLine(cursor.line, newLine);
                    const didaId = linkMatch[1];
                    const task = this.settings.tasks.find(t => t.didaId === didaId);
                    if (task) {
                        const baseDate = date.includes("T") ? date : (() => {
                            const now = new Date();
                            const parts = date.split("-");
                            const y = parseInt(parts[0]);
                            const m = parseInt(parts[1]) - 1;
                            const d = parseInt(parts[2]);
                            return new Date(y, m, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
                        })();
                        if (task.startDate && task.dueDate && task.startDate !== task.dueDate) {
                            const parts = date.split("-");
                            const y = parseInt(parts[0]);
                            const m = parseInt(parts[1]) - 1;
                            const d = parseInt(parts[2]);
                            const adjust = (t: string) => {
                                try {
                                    const dt = new Date(t);
                                    if (isNaN(dt.getTime())) return baseDate;
                                    return new Date(y, m, d, dt.getHours(), dt.getMinutes(), dt.getSeconds()).toISOString();
                                } catch (e) {
                                    return baseDate;
                                }
                            };
                            task.startDate = adjust(task.startDate);
                            task.dueDate = adjust(task.dueDate);
                        } else {
                            task.dueDate = baseDate;
                            task.startDate = baseDate;
                            task.isAllDay = true;
                        }
                        task.updatedAt = new Date().toISOString();
                        await this.saveSettings();
                        await this.updateTaskInDidaList(task);
                        this.refreshTaskView();
                    }
                } else {
                    new Notice("请先同步到滴答清单，再设置到期日期");
                }
            } else {
                new Notice("无法识别任务格式");
            }
        } catch (e: any) {
            let msg = "添加日期失败";
            if (e.message?.includes("401")) msg = "未经授权";
            else if (e.message?.includes("403")) msg = "禁止连接";
            else if (e.message?.includes("404")) msg = "未找到";
            else if (e.message) msg = "添加日期失败: " + e.message;
            new Notice("❌ " + msg);
        }
    }

    async updateTaskLineMetadata(editor: Editor, cursor: EditorPosition, line: string, metadata: TaskLineMetadata) {
        const parsed = parseTaskLine(line);
        if (!parsed) {
            new Notice("无法识别任务格式");
            return;
        }
        const newLine = formatTaskLine(line, metadata);
        editor.setLine(cursor.line, newLine);
        const next = parseTaskLine(newLine);
        if (!next || !next.didaId) return;

        const task = this.settings.tasks.find(t => t.didaId === next.didaId);
        if (!task) return;
        applyParsedLineToTask(task, next);
        task.updatedAt = new Date().toISOString();
        await this.saveSettings();
        if (this.settings.accessToken) {
            await this.updateTaskInDidaList(task);
        }
        this.refreshTaskView();
    }

    async handleDateChange(didaId: string, newDate: string, newTitle?: string) {
        try {
            const task = this.settings.tasks.find(t => t.didaId === didaId);
            if (task) {
                let baseDate = newDate.includes("T") ? newDate : (() => {
                    const now = new Date();
                    const parts = newDate.split("-");
                    const y = parseInt(parts[0]);
                    const m = parseInt(parts[1]) - 1;
                    const d = parseInt(parts[2]);
                    return new Date(y, m, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
                })();
                if (task.startDate && task.dueDate && task.startDate !== task.dueDate) {
                    const parts = newDate.split("-");
                    const y = parseInt(parts[0]);
                    const m = parseInt(parts[1]) - 1;
                    const d = parseInt(parts[2]);
                    const adjust = (t: string) => {
                        try {
                            const dt = new Date(t);
                            if (isNaN(dt.getTime())) return baseDate;
                            return new Date(y, m, d, dt.getHours(), dt.getMinutes(), dt.getSeconds()).toISOString();
                        } catch (e) {
                            return baseDate;
                        }
                    };
                    const start = adjust(task.startDate);
                    const due = adjust(task.dueDate);
                    if (task.startDate === start && task.dueDate === due) return;
                    task.startDate = start;
                    task.dueDate = due;
                } else {
                    if (task.dueDate === baseDate && task.startDate === baseDate) return;
                    task.dueDate = baseDate;
                    task.startDate = baseDate;
                    task.isAllDay = true;
                }
                if (newTitle) {
                    let cleanTitle = newTitle;
                    // 去除 [🔗Dida](obsidian://...) 链接
                    cleanTitle = cleanTitle.replace(/\s*\[🔗Dida\]\(obsidian:\/\/dida-task\?didaId=[a-zA-Z0-9]+\)\s*/g, "").trim();
                    // 去除 📅 日期后缀（防万一）
                    cleanTitle = cleanTitle.replace(/\s*📅\s*\d{4}-\d{2}-\d{2}\s*/g, "").trim();
                    cleanTitle = cleanTitle.replace(/\s*\[[0-9]{1,2}:[0-9]{2}\s*-\s*[0-9]{1,2}:[0-9]{2}\]\s*/g, "").trim();
                    cleanTitle = cleanTitle.replace(/\s*🔁\s*every[^📅🔴🟡🔵⚪]*/g, "").trim();
                    cleanTitle = cleanTitle.replace(/[🔴🟡🔵⚪]/g, "").replace(/\s+/g, " ").trim();
                    task.title = cleanTitle;
                }
                task.updatedAt = new Date().toISOString();
                await this.saveSettings();
                await this.updateTaskInDidaList(task);
                this.refreshTaskView();
            }
        } catch (e: any) {
            let msg = "同步日期变更失败";
            if (e.message?.includes("401")) msg = "未经授权";
            else if (e.message?.includes("403")) msg = "禁止连接";
            else if (e.message?.includes("404")) msg = "未找到";
            else if (e.message) msg = "同步日期变更失败: " + e.message;
            new Notice("❌ " + msg);
        }
    }

    async handleTitleChange(didaId: string, newTitle: string) {
        try {
            const task = this.settings.tasks.find(t => t.didaId === didaId);
            if (task && task.title !== newTitle) {
                task.title = newTitle;
                task.updatedAt = new Date().toISOString();
                await this.saveSettings();
                await this.updateTaskInDidaList(task);
                this.refreshTaskView();
                new Notice("✅ 已同步标题变更到滴答清单");
            }
        } catch (e: any) {
            let msg = "同步标题变更失败";
            if (e.message?.includes("401")) msg = "未经授权";
            else if (e.message?.includes("403")) msg = "禁止连接";
            else if (e.message?.includes("404")) msg = "未找到";
            else if (e.message) msg = "同步标题变更失败: " + e.message;
            new Notice("❌ " + msg);
        }
    }

    handleTaskLinkClick(evt: MouseEvent) {
        const target = evt.target as HTMLElement;
        if (target.tagName === "A" && (target as HTMLAnchorElement).href && (target as HTMLAnchorElement).href.includes("obsidian://dida-task/")) {
            const didaId = (target as HTMLAnchorElement).href.split("obsidian://dida-task/")[1];
            this.openTaskDetails(didaId);
            evt.preventDefault();
            evt.stopPropagation();
        } else {
            let el: HTMLElement | null = target;
            while (el && el !== document.body) {
                const match = (el.textContent || el.innerText || "").match(/@@([a-zA-Z0-9]+)/);
                if (match) {
                    const didaId = match[1];
                    this.openTaskDetails(didaId);
                    evt.preventDefault();
                    evt.stopPropagation();
                    return;
                }
                el = el.parentElement;
            }
        }
    }

    // File Operations
    async findFilesWithDidaId(didaId: string): Promise<TFile[]> {
        const files: TFile[] = [];
        for (const file of this.app.vault.getMarkdownFiles()) {
            try {
                const content = await this.app.vault.read(file);
                const escaped = didaId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const regex = new RegExp(`\\[[^\\]]*\\]\\(obsidian://dida-task\\?didaId=${escaped}\\)`, "g");
                if (regex.test(content)) files.push(file);
            } catch (e) { }
        }
        return files;
    }

    async jumpToDidaIdInFile(didaId: string, button: HTMLElement | null = null) {
        const files = await this.findFilesWithDidaId(didaId);
        if (files.length === 0) return;
        if (files.length === 1) {
            await this.openFileAndLocateDidaId(files[0], didaId);
        } else {
            if (button) this.showFileSelectionDropdown(files, didaId, button);
            else this.showFileSelectionModal(files, didaId);
        }
    }

    async openFileAndLocateDidaId(file: TFile, didaId: string) {
        try {
            let targetLeaf: any = null;
            for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
                if (leaf.view && leaf.view.file && leaf.view.file.path === file.path) {
                    targetLeaf = leaf;
                    break;
                }
            }
            if (targetLeaf) this.app.workspace.setActiveLeaf(targetLeaf);
            else targetLeaf = await this.app.workspace.openLinkText(file.path, "", true);
            setTimeout(async () => {
                const view = targetLeaf.view;
                if (view && view.editor) {
                    const content = view.editor.getValue();
                    const lines = content.split("\n");
                    let foundLine = -1;
                    let indent = 0;
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const match = line.match(/^(\s*)-\s*\[([ x])\]\s*(.+)/);
                        if (match) {
                            const escaped = didaId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                            if (new RegExp(`\\[[^\\]]*\\]\\(obsidian://dida-task\\?didaId=${escaped}\\)`).test(line)) {
                                foundLine = i;
                                indent = match[1].length;
                                break;
                            }
                        }
                    }
                    if (foundLine !== -1) {
                        const cursor = { line: foundLine, ch: indent };
                        view.editor.setCursor(cursor);
                        view.editor.scrollIntoView(cursor, true);
                        const len = lines[foundLine].length;
                        if (view.editor.addHighlights) {
                            view.editor.addHighlights([{ line: foundLine, from: 0, to: len }]);
                            setTimeout(() => {
                                if (view.editor.removeHighlights) view.editor.removeHighlights();
                            }, 3000);
                        }
                    } else {
                        const escaped = didaId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                        const match = new RegExp(`\\[[^\\]]*\\]\\(obsidian://dida-task\\?didaId=${escaped}\\)`, "g").exec(content);
                        if (match) {
                            const pos = match.index;
                            const before = content.substring(0, pos).split("\n");
                            const line = before.length - 1;
                            const ch = before[before.length - 1].length;
                            view.editor.setCursor({ line, ch });
                            view.editor.scrollIntoView({ line, ch }, true);
                        }
                    }
                }
            }, 100);
        } catch (e) { }
    }

    showFileSelectionDropdown(files: TFile[], didaId: string, button: HTMLElement) {
        const dropdown = document.createElement("div");
        dropdown.className = "dida-file-dropdown";
        const list = dropdown.createDiv("dida-file-list");
        files.forEach(file => {
            const item = list.createDiv("dida-file-item");
            item.createEl("span", { text: file.basename, cls: "dida-file-name" });
            item.createEl("span", { text: file.path, cls: "dida-file-path" });
            item.onclick = async () => {
                dropdown.remove();
                await this.openFileAndLocateDidaId(file, didaId);
            };
        });
        const rect = button.getBoundingClientRect();
        dropdown.setCssStyles({
            position: "absolute",
            top: `${rect.bottom + 5}px`,
            left: `${rect.left}px`,
            zIndex: "1000"
        });
        document.body.appendChild(dropdown);
        const handleClickOutside = (evt: MouseEvent) => {
            if (!dropdown.contains(evt.target as Node) && !button.contains(evt.target as Node)) {
                dropdown.remove();
                document.removeEventListener("click", handleClickOutside);
            }
        };
        setTimeout(() => {
            document.addEventListener("click", handleClickOutside);
        }, 100);
    }

    showFileSelectionModal(files: TFile[], didaId: string) {
        const modal = new Modal(this.app);
        modal.titleEl.setText("选择包含任务链接的文件");
        const container = modal.contentEl.createDiv();
        container.createEl("p", { text: `找到 ${files.length} 个包含任务链接的文件:` });
        const list = container.createDiv("file-selection-list");
        files.forEach(file => {
            const item = list.createDiv("file-item");
            item.createEl("span", { text: file.basename, cls: "file-name" });
            item.createEl("span", { text: file.path, cls: "file-path" });
            item.onclick = async () => {
                modal.close();
                await this.openFileAndLocateDidaId(file, didaId);
            };
        });
        modal.open();
    }

    async deleteDidaIdFromMarkdown(didaId: string) {
        try {
            this._isUpdatingNativeTaskStatus = true;
            const files = await this.findFilesWithDidaId(didaId);
            if (files.length > 0) {
                for (const file of files) {
                    try {
                        const content = await this.app.vault.read(file);
                        const lines = content.split("\n");
                        const escaped = didaId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                        const regex = new RegExp(`\\[🔗Dida\\]\\(obsidian://dida-task\\?didaId=${escaped}\\)`);
                        const newContent = lines.filter(line => !regex.test(line)).join("\n");
                        if (newContent !== content) await this.app.vault.modify(file, newContent);
                    } catch (e) { }
                }
            }
        } catch (e) { }
        finally {
            this._isUpdatingNativeTaskStatus = false;
        }
    }

    openTaskDetails(didaId: string) {
        const task = this.settings.tasks.find(t => t.didaId === didaId);
        if (task) {
            this.openTaskViewWithCache().then(() => {
                this.showTaskDetailsInViewOptimized(task);
            }).catch(() => {
                this.showTaskDetailsInView(task);
            });
        } else {
            new Notice("该任务已完成");
        }
    }

    showTaskDetailsInViewOptimized(task: DidaTask) {
        try {
            const el = document.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement | null;
            if (el) {
                if (el.classList.contains("dida-timeline-task-item")) {
                    const modal = this.getTimelineModalSafely();
                    if (modal && modal.toggleTimelineTaskDetails) {
                        modal.toggleTimelineTaskDetails(el, task);
                        this.scrollToTaskItem(el);
                    } else {
                        const title = el.querySelector(".dida-timeline-task-title, .dida-task-title-clickable");
                        if (title) {
                            const evt = new Event("click", { bubbles: true });
                            title.dispatchEvent(evt);
                            this.scrollToTaskItem(el);
                        }
                    }
                } else {
                    const view = this.getTaskViewSafely();
                    if (view && view.toggleTaskDetails) {
                        view.toggleTaskDetails(el, task);
                        this.scrollToTaskItem(el);
                    } else {
                        const title = el.querySelector(".dida-task-title, .dida-task-title-clickable");
                        if (title) {
                            const evt = new Event("click", { bubbles: true });
                            title.dispatchEvent(evt);
                            this.scrollToTaskItem(el);
                        } else {
                            this.showTaskDetailsInView(task);
                        }
                    }
                }
            } else {
                this.refreshTaskView();
                requestAnimationFrame(() => {
                    const next = document.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement | null;
                    if (next) {
                        if (next.classList.contains("dida-timeline-task-item")) {
                            const modal = this.getTimelineModalSafely();
                            if (modal && modal.toggleTimelineTaskDetails) {
                                modal.toggleTimelineTaskDetails(next, task);
                                this.scrollToTaskItem(next);
                            } else {
                                this.showTaskDetailsInView(task);
                            }
                        } else {
                            const view = this.getTaskViewSafely();
                            if (view && view.toggleTaskDetails) {
                                view.toggleTaskDetails(next, task);
                                this.scrollToTaskItem(next);
                            } else {
                                this.showTaskDetailsInView(task);
                            }
                        }
                    } else {
                        this.showTaskDetailsInView(task);
                    }
                });
            }
        } catch (e) {
            this.showTaskDetailsInView(task);
        }
    }

    showTaskDetailsInView(task: DidaTask) {
        for (const el of document.querySelectorAll(".dida-task-item, .dida-timeline-task-item")) {
            if ((el as HTMLElement).getAttribute("data-task-id") === task.id) {
                if ((el as HTMLElement).classList.contains("dida-timeline-task-item")) {
                    const modal = this.getTimelineModalSafely();
                    if (modal && modal.toggleTimelineTaskDetails) {
                        modal.toggleTimelineTaskDetails(el as HTMLElement, task);
                        this.scrollToTaskItem(el as HTMLElement);
                    } else {
                        const title = (el as HTMLElement).querySelector(".dida-timeline-task-title, .dida-task-title-clickable");
                        if (title) {
                            const evt = new Event("click", { bubbles: true });
                            title.dispatchEvent(evt);
                            this.scrollToTaskItem(el as HTMLElement);
                        }
                    }
                } else {
                    const title = (el as HTMLElement).querySelector(".dida-task-title, .dida-task-title-clickable");
                    if (title) {
                        const evt = new Event("click", { bubbles: true });
                        title.dispatchEvent(evt);
                        this.scrollToTaskItem(el as HTMLElement);
                    } else {
                        const view = this.getTaskViewSafely();
                        if (view && view.toggleTaskDetails) {
                            view.toggleTaskDetails(el as HTMLElement, task);
                            this.scrollToTaskItem(el as HTMLElement);
                        }
                    }
                }
                return;
            }
        }
    }

    getTaskViewSafely(): TaskView | null {
        try {
            const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
            if (leaves.length > 0) {
                const view = leaves[0].view as TaskView;
                if (view && typeof (view as any).toggleTaskDetails === "function") return view;
            }
            const cachedLeafAvailable = this._cachedTaskLeaf && this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE).includes(this._cachedTaskLeaf);
            if (cachedLeafAvailable && this._cachedTaskLeaf) {
                const view = this._cachedTaskLeaf.view as TaskView;
                if (view && typeof (view as any).toggleTaskDetails === "function") return view;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    getTimelineModalSafely(): any | null {
        try {
            for (const modalEl of document.querySelectorAll(".modal")) {
                if (modalEl.querySelector(".dida-timeline-modal") || modalEl.querySelector(".dida-timeline-container")) {
                    const modal = this.app.workspace.getActiveModal();
                    if (modal && typeof (modal as any).toggleTimelineTaskDetails === "function") return modal;
                }
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    clearTaskViewCache() {
        this._cachedTaskLeaf = null;
    }

    scrollToTaskItem(el: HTMLElement) {
        if (el) {
            try {
                el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
                el.classList.add("dida-scroll-highlight");
                setTimeout(() => {
                    el.classList.remove("dida-scroll-highlight");
                }, 3000);
            } catch (e) { }
        }
    }

    setupDidaLinkHandler() {
        new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        (node as HTMLElement).querySelectorAll('a[href*="obsidian://dida-task/"]').forEach(link => {
                            link.addEventListener("click", evt => {
                                const didaId = (link as HTMLAnchorElement).href.split("obsidian://dida-task/")[1];
                                this.openTaskDetails(didaId);
                                evt.preventDefault();
                                evt.stopPropagation();
                            });
                        });
                    }
                });
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    async saveTaskDetails(index: number, title: string, content: string, contentField: string, startDate?: Date | string, dueDate?: boolean) {
        const task = this.settings.tasks[index];
        if (task) {
            const trimmed = title.trim();
            if (trimmed) {
                const titleChanged = task.title !== trimmed;
                const oldTitle = task.title;
                const oldDueDate = task.dueDate;
                let dateChanged = false;
                let due = startDate as any;
                if (startDate !== undefined) {
                    if (startDate instanceof Date) {
                        const d = startDate;
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, "0");
                        const day = String(d.getDate()).padStart(2, "0");
                        const h = String(d.getHours()).padStart(2, "0");
                        const min = String(d.getMinutes()).padStart(2, "0");
                        const s = String(d.getSeconds()).padStart(2, "0");
                        const offset = d.getTimezoneOffset();
                        const oh = Math.abs(Math.floor(offset / 60));
                        const om = Math.abs(offset % 60);
                        const tz = (offset <= 0 ? "+" : "-") + String(oh).padStart(2, "0") + String(om).padStart(2, "0");
                        due = `${y}-${m}-${day}T${h}:${min}:${s}${tz}`;
                    }
                    dateChanged = oldDueDate !== due;
                }
                task.title = trimmed;
                if (startDate !== undefined) task.dueDate = due;
                if (dueDate !== undefined) task.isAllDay = dueDate as any;
                if (contentField === "desc") task.desc = content;
                else task.content = content;
                task.updatedAt = new Date().toISOString();
                await this.saveSettings();
                if (titleChanged && task.didaId) {
                    const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
                    if (leaves.length > 0) {
                        const view = leaves[0].view as any;
                        if (view.updateNativeTaskTitle) await view.updateNativeTaskTitle(task, oldTitle, trimmed);
                    }
                }
                if (dateChanged && task.didaId) {
                    const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
                    if (leaves.length > 0) {
                        const view = leaves[0].view as any;
                        if (view.updateNativeTaskDueDate) await view.updateNativeTaskDueDate(task, oldDueDate, due);
                    }
                }
            } else {
                new Notice("任务标题不能为空");
            }
        }
    }

    updateTaskStatusDirectly(task: DidaTask, status: number) {
        task.status = status;
        if (status === 2) {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, "0");
            const d = String(now.getDate()).padStart(2, "0");
            const h = String(now.getHours()).padStart(2, "0");
            const min = String(now.getMinutes()).padStart(2, "0");
            const s = String(now.getSeconds()).padStart(2, "0");
            const offset = now.getTimezoneOffset();
            const oh = Math.abs(Math.floor(offset / 60));
            const om = Math.abs(offset % 60);
            const tz = (offset <= 0 ? "+" : "-") + String(oh).padStart(2, "0") + String(om).padStart(2, "0");
            task.completed = true;
            task.completedTime = `${y}-${m}-${d}T${h}:${min}:${s}${tz}`;
        } else {
            task.completed = false;
            task.completedTime = null;
        }
        task.updatedAt = new Date().toISOString();
    }
}
