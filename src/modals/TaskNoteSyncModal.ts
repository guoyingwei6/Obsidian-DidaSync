import { App, Modal, Notice, Setting, TFile } from "obsidian";
import DidaSyncPlugin from "../main";
import {
    TaskNoteDidaBlockAnalysis,
    TaskNoteSyncRangeType
} from "../managers/TaskNoteSyncManager";
import { DidaSyncBlockConfig } from "../taskNoteBlock";
import { ProjectCatalogEntry } from "../types";
import { DatePickerModal } from "./DatePickerModal";
import { TaskNoteProjectPickerModal } from "./TaskNoteProjectPickerModal";

type TaskNoteSyncModalMode = "note" | "blocks";

export class TaskNoteSyncModal extends Modal {
    plugin: DidaSyncPlugin;
    sourceFile: TFile | null;
    targetFile: TFile | null = null;
    mode: TaskNoteSyncModalMode = "note";
    rangeType: TaskNoteSyncRangeType = "day";
    createNewFile = false;
    baseDate = "";
    startDate = "";
    endDate = "";
    projectScope: "all" | "visible" | "custom" = "all";
    selectedProjectKeys: string[] = [];
    previewEl: HTMLElement | null = null;
    blockAnalysis: TaskNoteDidaBlockAnalysis | null = null;
    selectedBlockIndex = -1;
    blockHeader = "> [!didasync]";
    blockRangeType: "day" | "custom" = "day";
    blockBaseDate = "";
    blockStartDate = "";
    blockEndDate = "";
    blockProjectScope: "all" | "custom" = "all";
    blockProjectKeys: string[] = [];

    constructor(app: App, plugin: DidaSyncPlugin, sourceFile: TFile | null = null) {
        super(app);
        this.plugin = plugin;
        this.sourceFile = sourceFile;
    }

    async onOpen() {
        this.modalEl.addClass("dida-task-note-sync-modal-shell");
        const today = this.plugin.taskNoteSyncManager.formatDateOnly(new Date());
        this.targetFile = this.sourceFile || this.app.workspace.getActiveFile();
        const targetContext = this.targetFile instanceof TFile
            ? await this.plugin.taskNoteSyncManager.resolveTargetContext(this.targetFile)
            : null;

        this.rangeType = targetContext?.rangeType || "day";
        this.baseDate = targetContext?.baseDate || today;
        this.startDate = targetContext?.startDate || this.baseDate;
        this.endDate = targetContext?.endDate || this.baseDate;
        this.createNewFile = this.plugin.settings.taskNoteSyncCreateNewFile;
        this.projectScope = this.plugin.settings.taskNoteSyncProjectScope || "all";
        this.selectedProjectKeys = Array.isArray(this.plugin.settings.taskNoteSyncProjectKeys)
            ? [...this.plugin.settings.taskNoteSyncProjectKeys]
            : [];
        this.blockAnalysis = await this.plugin.taskNoteSyncManager.analyzeDidaBlocksInFile(this.targetFile);
        if (this.blockAnalysis && this.blockAnalysis.totalBlocks > 0) this.mode = "blocks";
        this.initializeBlockForm();
        this.render();
    }

    render() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("dida-task-note-sync-modal");
        contentEl.createEl("h3", { text: "同步任务到笔记" });

        new Setting(contentEl)
            .setClass("dida-task-note-legacy-mode")
            .setName("同步模式")
            .setDesc("选择写入汇总笔记，或刷新当前文件中的 didasync 块。")
            .addDropdown((dropdown) => dropdown
                .addOption("note", "同步到汇总笔记")
                .addOption("blocks", "同步当前文件块")
                .setValue(this.mode)
                .onChange((value) => {
                    this.mode = value as TaskNoteSyncModalMode;
                    this.render();
                }));

        this.renderModeTabs(contentEl);

        if (this.mode === "blocks") {
            this.renderBlockMode(contentEl);
        } else {
            this.renderNoteMode(contentEl);
        }

        const buttons = contentEl.createDiv("dida-calendar-buttons");
        buttons.createEl("button", { text: "取消" }).onclick = () => this.close();
        const syncButton = buttons.createEl("button", {
            text: this.mode === "blocks" ? "同步块" : "同步",
            cls: "mod-cta"
        });
        if (this.mode === "blocks" && !this.canSyncBlocks()) {
            syncButton.disabled = true;
        }
        syncButton.onclick = async () => {
            if (this.mode === "blocks") {
                if (!(this.targetFile instanceof TFile) || !this.canSyncBlocks()) return;
                this.close();
                await this.plugin.taskNoteSyncManager.syncDidaBlocksInFile(this.targetFile);
                return;
            }

            const range = this.buildRange();
            if (!range) return;
            if (this.projectScope === "custom" && this.selectedProjectKeys.length === 0) {
                new Notice("请至少选择一个清单");
                return;
            }
            this.close();
            await this.plugin.taskNoteSyncManager.syncTasksToNote({
                range,
                createNewFile: this.createNewFile,
                projectScope: this.projectScope,
                projectKeys: this.getSelectedProjectKeysForSync()
            });
        };
    }

    renderModeTabs(contentEl: HTMLElement) {
        const tabs = contentEl.createDiv("dida-task-note-mode-tabs");
        const options: Array<{ mode: TaskNoteSyncModalMode; label: string; desc: string }> = [
            { mode: "note", label: "汇总笔记", desc: "按日期写入任务汇总" },
            { mode: "blocks", label: "当前文件块", desc: "编辑并刷新 didasync 块" }
        ];
        options.forEach((option) => {
            const tab = tabs.createDiv({
                cls: `dida-task-note-mode-tab${this.mode === option.mode ? " is-active" : ""}`
            });
            tab.createDiv({ cls: "dida-task-note-mode-tab-label", text: option.label });
            tab.createDiv({ cls: "dida-task-note-mode-tab-desc", text: option.desc });
            tab.onclick = () => {
                if (this.mode === option.mode) return;
                this.mode = option.mode;
                this.render();
            };
        });
    }

    renderNoteMode(contentEl: HTMLElement) {
        new Setting(contentEl)
            .setName("任务范围")
            .setDesc("选择要写入笔记的任务日期范围。")
            .addDropdown((dropdown) => dropdown
                .addOption("day", "某日")
                .addOption("week", "某周")
                .addOption("month", "某月")
                .addOption("year", "某年")
                .addOption("custom", "自定义时间段")
                .setValue(this.rangeType)
                .onChange((value) => {
                    this.rangeType = value as TaskNoteSyncRangeType;
                    this.render();
                }));

        if (this.rangeType === "custom") {
            this.addDateInput(contentEl, "开始日期", this.startDate, (value) => {
                this.startDate = value;
                this.updatePreview();
            });
            this.addDateInput(contentEl, "结束日期", this.endDate, (value) => {
                this.endDate = value;
                this.updatePreview();
            });
        } else {
            this.addDateInput(contentEl, "基准日期", this.baseDate, (value) => {
                this.baseDate = value;
                this.updatePreview();
            });
        }

        new Setting(contentEl)
            .setName("清单来源")
            .setDesc("选择要写入笔记的任务清单范围。")
            .addDropdown((dropdown) => dropdown
                .addOption("all", "全部清单")
                .addOption("visible", "仅侧边栏可见清单")
                .addOption("custom", "自定义清单")
                .setValue(this.projectScope)
                .onChange(async (value) => {
                    this.projectScope = value as "all" | "visible" | "custom";
                    this.plugin.settings.taskNoteSyncProjectScope = this.projectScope;
                    await this.plugin.saveSettings();
                    this.render();
                }));

        if (this.projectScope === "custom") {
            this.renderProjectPickerEntry(contentEl);
        }

        new Setting(contentEl)
            .setName("每次生成新笔记")
            .setDesc("开启后不会复用旧文件，而是自动追加序号创建新笔记。关闭后优先写入同名笔记，不存在时再创建。")
            .addToggle((toggle) => toggle
                .setValue(this.createNewFile)
                .onChange(async (value) => {
                    this.createNewFile = value;
                    this.plugin.settings.taskNoteSyncCreateNewFile = value;
                    await this.plugin.saveSettings();
                    this.updatePreview();
                }));

        this.previewEl = contentEl.createDiv("dida-task-note-summary-panel");
        this.updatePreview();
    }

    renderBlockMode(contentEl: HTMLElement) {
        const info = contentEl.createDiv("dida-settings-info dida-settings-info--primary dida-task-note-block-status");
        if (!(this.targetFile instanceof TFile)) {
            info.setText("当前没有可用的 Markdown 文件，无法同步 didasync 块。");
            return;
        }

        if (!this.blockAnalysis) {
            info.setText(`当前文件：${this.targetFile.path}`);
            return;
        }

        info.createDiv({ text: `当前文件：${this.blockAnalysis.file.path}` });
        info.createDiv({ text: `检测到 ${this.blockAnalysis.totalBlocks} 个 didasync 块` });
        info.createDiv({ text: `可同步 ${this.blockAnalysis.validBlocks} 个，配置错误 ${this.blockAnalysis.invalidBlocks} 个` });

        this.renderSummaryItem(info, "当前文件", this.blockAnalysis.file.path, "dida-task-note-summary-item--path");
        this.renderSummaryItem(info, "检测块数", `${this.blockAnalysis.totalBlocks}`);
        this.renderSummaryItem(info, "可同步", `${this.blockAnalysis.validBlocks}`);
        this.renderSummaryItem(info, "配置错误", `${this.blockAnalysis.invalidBlocks}`, this.blockAnalysis.invalidBlocks > 0 ? "dida-task-note-summary-item--error" : "");

        const editorEl = contentEl.createDiv("dida-task-note-block-editor");
        this.renderBlockEditor(editorEl);

        if (this.blockAnalysis.totalBlocks > 0) this.renderBlockSummary(contentEl);
    }

    canSyncBlocks() {
        return !!this.blockAnalysis && this.blockAnalysis.validBlocks > 0 && this.targetFile instanceof TFile;
    }

    renderBlockEditor(contentEl: HTMLElement) {
        const analysis = this.blockAnalysis;
        new Setting(contentEl)
            .setName("编辑块")
            .setDesc("选择已有块进行编辑，或新建一个 didasync 块。")
            .addDropdown((dropdown) => {
                dropdown.addOption("-1", "新建同步块");
                analysis?.items.forEach((item, index) => {
                    dropdown.addOption(String(index), `块 ${index + 1}（第 ${item.lineIndex + 1} 行）`);
                });
                dropdown
                    .setValue(String(this.selectedBlockIndex))
                    .onChange((value) => {
                        this.selectedBlockIndex = Number(value);
                        this.loadBlockFormFromSelection();
                        this.render();
                    });
            });

        new Setting(contentEl)
            .setName("块标题")
            .setDesc("默认使用写入区块设置，也可使用兼容的 didasync 标题。")
            .addDropdown((dropdown) => {
                const configured = (this.plugin.settings.taskNoteSyncTargetBlockHeader || "> [!todo]").trim();
                const headers = Array.from(new Set([configured, "> [!didasync]", this.blockHeader].filter(Boolean)));
                headers.forEach((header) => dropdown.addOption(header, header));
                dropdown
                    .setValue(this.blockHeader)
                    .onChange((value) => {
                        this.blockHeader = value;
                    });
            });

        new Setting(contentEl)
            .setName("块任务范围")
            .setDesc("保存后会写入块配置；同步时读取文件中的配置。")
            .addDropdown((dropdown) => dropdown
                .addOption("day", "某日")
                .addOption("custom", "自定义时间段")
                .setValue(this.blockRangeType)
                .onChange((value) => {
                    this.blockRangeType = value as "day" | "custom";
                    this.render();
                }));

        if (this.blockRangeType === "custom") {
            this.addDateInput(contentEl, "块开始日期", this.blockStartDate, (value) => {
                this.blockStartDate = value;
            });
            this.addDateInput(contentEl, "块结束日期", this.blockEndDate, (value) => {
                this.blockEndDate = value;
            });
        } else {
            this.addDateInput(contentEl, "块日期", this.blockBaseDate, (value) => {
                this.blockBaseDate = value;
                this.blockStartDate = value;
                this.blockEndDate = value;
            });
        }

        new Setting(contentEl)
            .setName("块清单来源")
            .setDesc("保存后写入 projects；同步时读取块内 projects。")
            .addDropdown((dropdown) => dropdown
                .addOption("all", "全部清单")
                .addOption("custom", "自定义清单")
                .setValue(this.blockProjectScope)
                .onChange((value) => {
                    this.blockProjectScope = value as "all" | "custom";
                    this.render();
                }));

        if (this.blockProjectScope === "custom") {
            new Setting(contentEl)
                .setName("块自定义清单")
                .setDesc(`已选择 ${this.blockProjectKeys.length} 个清单：${this.getBlockProjectPreviewText()}`)
                .addButton((button) => button
                    .setButtonText("选择清单")
                    .onClick(() => {
                        new TaskNoteProjectPickerModal(this.app, this.plugin, this.blockProjectKeys, (keys) => {
                            this.blockProjectKeys = keys;
                            this.render();
                        }).open();
                    }));
        }

        const preview = contentEl.createDiv("dida-task-note-config-preview");
        const blockConfig = this.buildBlockConfig();
        this.renderSummaryItem(preview, "范围", blockConfig.range);
        this.renderSummaryItem(preview, "清单", blockConfig.projects.length > 0 ? blockConfig.projects.join("、") : "全部清单");
        this.renderSummaryItem(preview, "写入配置", this.selectedBlockIndex >= 0 ? "更新所选块" : "插入新同步块");
        preview.createDiv({ text: `配置预览：${JSON.stringify(this.buildBlockConfig())}` });

        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText(this.selectedBlockIndex >= 0 ? "保存块配置" : "插入同步块")
                .setCta()
                .onClick(async () => {
                    await this.saveBlockConfig();
                }));
    }

    renderBlockSummary(contentEl: HTMLElement) {
        const list = contentEl.createDiv("dida-task-note-block-list");
        this.blockAnalysis?.items.forEach((item, index) => {
            const row = list.createDiv(`dida-task-note-block-row${item.error ? " has-error" : ""}`);
            const main = row.createDiv("dida-task-note-block-row-main");
            const title = main.createDiv("dida-task-note-block-row-title");
            title.createSpan({ cls: "dida-task-note-block-row-index", text: `块 ${index + 1}` });
            title.createSpan({ cls: "dida-task-note-block-row-name", text: item.title || "未命名块" });
            main.createDiv({ cls: "dida-task-note-block-row-line", text: `第 ${item.lineIndex + 1} 行` });
            const meta = row.createDiv("dida-task-note-block-row-meta");
            this.renderSummaryItem(meta, "范围", item.rangeText);
            this.renderSummaryItem(meta, "清单", item.projectsText);
            if (item.error) this.renderSummaryItem(meta, "错误", item.error, "dida-task-note-summary-item--error");
            row.createDiv({ text: `块 ${index + 1}：${item.title || "未命名块"}` });
            row.createDiv({ text: `范围：${item.rangeText}` });
            row.createDiv({ text: `清单：${item.projectsText}` });
            if (item.error) row.createDiv({ text: `错误：${item.error}` });
        });
    }

    initializeBlockForm() {
        const today = this.baseDate || this.plugin.taskNoteSyncManager.formatDateOnly(new Date());
        this.blockHeader = (this.plugin.settings.taskNoteSyncTargetBlockHeader || "> [!didasync]").trim();
        this.blockRangeType = "day";
        this.blockBaseDate = today;
        this.blockStartDate = today;
        this.blockEndDate = today;
        this.blockProjectScope = "all";
        this.blockProjectKeys = [];
        if (this.blockAnalysis && this.blockAnalysis.items.length > 0) {
            this.selectedBlockIndex = 0;
            this.loadBlockFormFromSelection();
        }
    }

    loadBlockFormFromSelection() {
        const item = this.blockAnalysis?.items.find((candidate) => candidate.blockIndex === this.selectedBlockIndex);
        if (!item) {
            this.selectedBlockIndex = -1;
            this.blockHeader = (this.plugin.settings.taskNoteSyncTargetBlockHeader || "> [!didasync]").trim();
            return;
        }

        this.blockHeader = item.header || this.blockHeader;
        const rawRange = item.config.range || this.blockBaseDate;
        const rangeParts = rawRange.split("~").map((part) => part.trim()).filter(Boolean);
        const hasValidRangeStart = /^\d{4}-\d{2}-\d{2}$/.test(rangeParts[0] || "");
        const range = hasValidRangeStart
            ? this.plugin.taskNoteSyncManager.createRange(
                rangeParts.length > 1 ? "custom" : "day",
                rangeParts[0],
                rangeParts[1]
            )
            : this.plugin.taskNoteSyncManager.createRange("day", this.blockBaseDate);
        this.blockRangeType = range.startDate === range.endDate ? "day" : "custom";
        this.blockBaseDate = range.startDate;
        this.blockStartDate = range.startDate;
        this.blockEndDate = range.endDate;
        this.blockProjectKeys = (item.config.projects || []).map((project) => this.getProjectFilterKeyForConfigProject(project));
        this.blockProjectScope = this.blockProjectKeys.length > 0 ? "custom" : "all";
    }

    buildBlockConfig(): DidaSyncBlockConfig {
        const range = this.blockRangeType === "custom"
            ? this.plugin.taskNoteSyncManager.createRange("custom", this.blockStartDate, this.blockEndDate)
            : this.plugin.taskNoteSyncManager.createRange("day", this.blockBaseDate);
        return {
            range: range.startDate === range.endDate ? range.startDate : `${range.startDate}~${range.endDate}`,
            projects: this.blockProjectScope === "custom" ? this.getBlockProjectNamesForConfig() : []
        };
    }

    async saveBlockConfig() {
        if (!(this.targetFile instanceof TFile)) {
            new Notice("请选择一个 Markdown 文件");
            return;
        }
        if (this.blockProjectScope === "custom" && this.blockProjectKeys.length === 0) {
            new Notice("请至少选择一个清单");
            return;
        }
        this.blockAnalysis = await this.plugin.taskNoteSyncManager.saveDidaBlockConfigInFile(this.targetFile, {
            blockIndex: this.selectedBlockIndex >= 0 ? this.selectedBlockIndex : undefined,
            header: this.blockHeader,
            config: this.buildBlockConfig()
        });
        if (this.selectedBlockIndex < 0 && this.blockAnalysis) {
            this.selectedBlockIndex = Math.max(0, this.blockAnalysis.items.length - 1);
        }
        this.loadBlockFormFromSelection();
        this.render();
    }

    getBlockProjectNamesForConfig(): string[] {
        return this.blockProjectKeys.map((key) => this.getProjectNameForFilterKey(key));
    }

    getBlockProjectPreviewText(): string {
        if (this.blockProjectKeys.length === 0) return "未选择";
        return this.getBlockProjectNamesForConfig().join("、");
    }

    getProjectNameForFilterKey(key: string): string {
        const projects = this.getProjectOptions();
        const matched = projects.find((project) =>
            this.plugin.getProjectFilterKeyAliases(project.id, project.name).includes(this.normalizeConfigProjectKey(key))
        );
        if (matched?.name) return matched.name;
        if (key.startsWith("name:")) return key.substring(5);
        return key;
    }

    getProjectFilterKeyForConfigProject(projectKey: string): string {
        const normalized = this.normalizeConfigProjectKey(projectKey);
        const matched = this.getProjectOptions().find((project) =>
            this.plugin.getProjectFilterKeyAliases(project.id, project.name).includes(normalized)
        );
        return matched ? this.plugin.getProjectFilterKey(matched.id, matched.name) : normalized;
    }

    normalizeConfigProjectKey(projectKey: string): string {
        const trimmed = (projectKey || "").trim();
        return /^(id|name):/.test(trimmed) ? trimmed : `name:${trimmed}`;
    }

    addDateInput(containerEl: HTMLElement, name: string, value: string, onChange: (value: string) => void) {
        new Setting(containerEl)
            .setName(name)
            .addButton((button) => {
                button.setIcon("calendar");
                button.setButtonText(value || "选择日期");
                button.onClick(() => {
                    new DatePickerModal(
                        this.app,
                        value || null,
                        (date) => {
                            if (!date) return;
                            const nextValue = this.plugin.taskNoteSyncManager.formatDateOnly(date);
                            onChange(nextValue);
                            this.render();
                        },
                        button.buttonEl,
                        null,
                        null,
                        { dateOnly: true }
                    ).open();
                });
            });
    }

    renderProjectPickerEntry(containerEl: HTMLElement) {
        const projects = this.getProjectOptions();
        if (projects.length === 0) {
            const empty = containerEl.createDiv("dida-settings-info");
            empty.setText("暂无可选清单，请先同步任务。");
            return;
        }

        new Setting(containerEl)
            .setName("自定义清单")
            .setDesc(`已选择 ${this.selectedProjectKeys.length} / ${projects.length} 个清单。`)
            .addButton((button) => button
                .setButtonText("选择清单")
                .onClick(() => {
                    new TaskNoteProjectPickerModal(this.app, this.plugin, this.selectedProjectKeys, (keys) => {
                        this.selectedProjectKeys = keys;
                        this.updatePreview();
                    }).open();
                }));
    }

    getProjectOptions(): ProjectCatalogEntry[] {
        return this.plugin.getAvailableProjectConfigs()
            .filter((project) => this.plugin.settings.showArchivedProjects || !project.isArchived);
    }

    getSelectedProjectKeysForSync() {
        if (this.projectScope === "all") return [];
        if (this.projectScope === "visible") {
            return this.getProjectOptions()
                .filter((project) => this.plugin.isProjectVisible(project.id, project.name))
                .map((project) => this.plugin.getProjectFilterKey(project.id, project.name));
        }
        return [...this.selectedProjectKeys];
    }

    buildRange() {
        if (this.rangeType === "custom") {
            if (!this.startDate || !this.endDate) {
                new Notice("请选择开始日期和结束日期");
                return null;
            }
            return this.plugin.taskNoteSyncManager.createRange("custom", this.startDate, this.endDate);
        }

        if (!this.baseDate) {
            new Notice("请选择基准日期");
            return null;
        }
        return this.plugin.taskNoteSyncManager.createRange(this.rangeType, this.baseDate);
    }

    renderSummaryItem(containerEl: HTMLElement, label: string, value: string, extraClass: string = "") {
        const item = containerEl.createDiv({ cls: `dida-task-note-summary-item ${extraClass}`.trim() });
        item.createDiv({ cls: "dida-task-note-summary-label", text: label });
        item.createDiv({ cls: "dida-task-note-summary-value", text: value });
    }

    updatePreview() {
        if (!this.previewEl) return;
        if (this.rangeType === "custom" && (!this.startDate || !this.endDate)) {
            this.previewEl.setText("请选择有效日期。");
            return;
        }
        if (this.rangeType !== "custom" && !this.baseDate) {
            this.previewEl.setText("请选择有效日期。");
            return;
        }

        const range = this.rangeType === "custom"
            ? this.plugin.taskNoteSyncManager.createRange("custom", this.startDate, this.endDate)
            : this.plugin.taskNoteSyncManager.createRange(this.rangeType, this.baseDate);

        const filePath = this.plugin.taskNoteSyncManager.buildTargetFilePath(range);
        const fileMode = this.createNewFile ? "生成新的笔记文件" : "写入同名笔记，若不存在则新建";
        const projectLabel = this.getProjectScopePreviewText();
        this.previewEl.empty();
        this.renderSummaryItem(this.previewEl, "任务范围", `${range.startDate} 至 ${range.endDate}`);
        this.renderSummaryItem(this.previewEl, "清单来源", projectLabel);
        this.renderSummaryItem(this.previewEl, "写入方式", fileMode);
        this.renderSummaryItem(this.previewEl, "目标位置", filePath, "dida-task-note-summary-item--path");
        this.previewEl.createDiv({ text: `任务范围：${range.startDate} 至 ${range.endDate}` });
        this.previewEl.createDiv({ text: `清单来源：${projectLabel}` });
        this.previewEl.createDiv({ text: `写入方式：${fileMode}` });
        this.previewEl.createDiv({ text: `目标位置：${filePath}` });
    }

    getProjectScopePreviewText() {
        if (this.projectScope === "all") return "全部清单";
        const keys = this.getSelectedProjectKeysForSync();
        if (this.projectScope === "visible") return `仅侧边栏可见清单（${keys.length} 个）`;
        const names = this.getProjectOptions()
            .filter((project) => keys.includes(this.plugin.getProjectFilterKey(project.id, project.name)))
            .map((project) => project.name);
        return names.length > 0 ? names.join("、") : "未选择清单";
    }

    onClose() {
        this.contentEl.empty();
    }
}
