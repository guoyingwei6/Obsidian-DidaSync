import { Modal, Notice } from "obsidian";
import DidaSyncPlugin from "../main";
import { DidaTask } from "../types";

export class ProjectMoveModal extends Modal {
    plugin: DidaSyncPlugin;
    task: DidaTask;
    onSubmit: (targetProjectId: string) => Promise<void> | void;
    selectEl: HTMLSelectElement | null = null;
    submitting: boolean = false;

    constructor(app: any, plugin: DidaSyncPlugin, task: DidaTask, onSubmit: (targetProjectId: string) => Promise<void> | void) {
        super(app);
        this.plugin = plugin;
        this.task = task;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: `移动任务：${this.task.title || "未命名任务"}` });
        contentEl.createEl("p", { text: "选择要移动到的目标项目。仅展示已同步到滴答清单的项目。" });

        const projects = this.plugin.getAvailableProjectConfigs()
            .filter((project) => project?.id && project.isLocalOnly !== true && project.id !== (this.task.projectId || "inbox"));

        this.selectEl = contentEl.createEl("select");
        this.selectEl.style.width = "100%";
        this.selectEl.style.marginBottom = "12px";

        if (projects.length === 0) {
            const option = this.selectEl.createEl("option", { text: "没有可用目标项目", value: "" });
            option.disabled = true;
            option.selected = true;
        } else {
            projects.forEach((project, index) => {
                const option = this.selectEl!.createEl("option", {
                    text: project.name,
                    value: project.id
                });
                if (index === 0) option.selected = true;
            });
        }

        const footer = contentEl.createDiv();
        footer.style.display = "flex";
        footer.style.justifyContent = "flex-end";
        footer.style.gap = "8px";

        const cancelBtn = footer.createEl("button", { text: "取消" });
        cancelBtn.addEventListener("click", () => this.close());

        const confirmBtn = footer.createEl("button", { text: "移动" });
        confirmBtn.addClass("mod-cta");
        confirmBtn.addEventListener("click", () => {
            this.submit(confirmBtn);
        });
    }

    async submit(buttonEl: HTMLButtonElement) {
        if (this.submitting) return;
        const targetProjectId = this.selectEl?.value || "";
        if (!targetProjectId) {
            new Notice("请选择目标项目");
            return;
        }
        this.submitting = true;
        buttonEl.disabled = true;
        try {
            await this.onSubmit(targetProjectId);
            this.close();
        } catch (e: any) {
            new Notice(e?.message || "移动任务失败");
            buttonEl.disabled = false;
            this.submitting = false;
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}
