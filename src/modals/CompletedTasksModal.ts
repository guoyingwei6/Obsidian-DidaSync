import { Modal, Notice } from "obsidian";
import DidaSyncPlugin from "../main";
import { DidaTask } from "../types";

export class CompletedTasksModal extends Modal {
    plugin: DidaSyncPlugin;
    startInput: HTMLInputElement | null = null;
    endInput: HTMLInputElement | null = null;
    resultEl: HTMLElement | null = null;
    loadingEl: HTMLElement | null = null;
    currentQuery: any = {};

    constructor(app: any, plugin: DidaSyncPlugin) {
        super(app);
        this.plugin = plugin;
        this.currentQuery = {
            ...this.plugin.buildDefaultCompletedTaskQuery(),
            ...(this.plugin.settings.completedTasksQuery || {})
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("dida-completed-modal");
        contentEl.createEl("h3", { text: "已完成任务" });

        const controls = contentEl.createDiv("dida-completed-controls");
        const startWrap = controls.createDiv("dida-completed-control");
        startWrap.createEl("label", { text: "开始日期" });
        this.startInput = startWrap.createEl("input", { type: "date" });
        this.startInput.value = this.extractDateValue(this.currentQuery.startDate);

        const endWrap = controls.createDiv("dida-completed-control");
        endWrap.createEl("label", { text: "结束日期" });
        this.endInput = endWrap.createEl("input", { type: "date" });
        this.endInput.value = this.extractDateValue(this.currentQuery.endDate);

        const actions = controls.createDiv("dida-completed-actions");
        const refreshBtn = actions.createEl("button", { text: "查询" });
        refreshBtn.addClass("mod-cta");
        refreshBtn.addEventListener("click", () => void this.runQuery());

        const presetBtn = actions.createEl("button", { text: "最近 7 天" });
        presetBtn.addEventListener("click", () => {
            const preset = this.plugin.buildDefaultCompletedTaskQuery();
            if (this.startInput) this.startInput.value = this.extractDateValue(preset.startDate);
            if (this.endInput) this.endInput.value = this.extractDateValue(preset.endDate);
        });

        this.loadingEl = contentEl.createDiv("dida-completed-loading");
        this.resultEl = contentEl.createDiv("dida-completed-results");
        void this.renderResults(this.plugin.settings.completedTasks || []);
    }

    extractDateValue(value?: string) {
        if (!value) return "";
        const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : "";
    }

    buildQueryFromInputs() {
        const query: any = {};
        if (this.startInput?.value) {
            query.startDate = this.plugin.formatDidaDateTime(new Date(`${this.startInput.value}T00:00:00`));
        }
        if (this.endInput?.value) {
            query.endDate = this.plugin.formatDidaDateTime(new Date(`${this.endInput.value}T23:59:59.999`));
        }
        return query;
    }

    async runQuery() {
        if (!this.loadingEl) return;
        this.loadingEl.textContent = "加载中...";
        try {
            const query = this.buildQueryFromInputs();
            this.currentQuery = query;
            const tasks = await this.plugin.fetchCompletedTasks(query);
            await this.renderResults(tasks || []);
            this.loadingEl.textContent = `共 ${tasks.length} 个任务`;
        } catch (e: any) {
            this.loadingEl.textContent = "";
            new Notice(e?.message || "获取已完成任务失败");
        }
    }

    async renderResults(tasks: DidaTask[]) {
        if (!this.resultEl) return;
        this.resultEl.empty();
        if (!Array.isArray(tasks) || tasks.length === 0) {
            this.resultEl.createEl("p", { text: "当前筛选条件下没有已完成任务", cls: "dida-empty-state" });
            return;
        }

        tasks
            .slice()
            .sort((a, b) => new Date(b.completedTime || 0 as any).getTime() - new Date(a.completedTime || 0 as any).getTime())
            .forEach((task) => {
                const item = this.resultEl!.createDiv("dida-completed-item");
                const titleRow = item.createDiv("dida-completed-item-title");
                titleRow.textContent = task.title || "未命名任务";
                const meta = item.createDiv("dida-completed-item-meta");
                const parts = [
                    task.projectName || (task.projectId === "inbox" ? "收集箱" : task.projectId),
                    task.completedTime ? `完成于 ${this.extractDateValue(task.completedTime)}` : "",
                    task.dueDate ? `原计划 ${this.extractDateValue(task.dueDate)}` : ""
                ].filter(Boolean);
                meta.textContent = parts.join(" · ");
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}
