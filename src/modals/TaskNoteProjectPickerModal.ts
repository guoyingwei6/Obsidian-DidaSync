import { App, Modal, Notice, Setting } from "obsidian";
import DidaSyncPlugin from "../main";
import { ProjectCatalogEntry } from "../types";

export class TaskNoteProjectPickerModal extends Modal {
    plugin: DidaSyncPlugin;
    selectedProjectKeys: string[];
    onSelectionChange: (keys: string[]) => void;

    constructor(app: App, plugin: DidaSyncPlugin, selectedProjectKeys: string[], onSelectionChange: (keys: string[]) => void) {
        super(app);
        this.plugin = plugin;
        this.selectedProjectKeys = [...selectedProjectKeys];
        this.onSelectionChange = onSelectionChange;
    }

    onOpen() {
        this.render();
    }

    render() {
        const content = this.contentEl;
        content.empty();
        content.createEl("h3", { text: "选择同步清单" });

        const projects = this.getProjectOptions();
        if (projects.length === 0) {
            content.createDiv("dida-settings-info", { text: "暂无可选清单，请先同步任务。" });
        } else {
            const controls = new Setting(content)
                .setName("自定义清单")
                .setDesc(`已选择 ${this.selectedProjectKeys.length} 个清单`);
            controls.addButton((button) => button
                .setButtonText("全选")
                .onClick(() => {
                    this.selectedProjectKeys = projects.map((project) => this.plugin.getProjectFilterKey(project.id, project.name));
                    this.render();
                }));
            controls.addButton((button) => button
                .setButtonText("清空")
                .onClick(() => {
                    this.selectedProjectKeys = [];
                    this.render();
                }));

            projects.forEach((project) => this.renderProjectRow(content, project));
        }

        const footer = content.createDiv("dida-modal-actions-row");
        footer.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
        const confirm = footer.createEl("button", { text: "完成" });
        confirm.addClass("mod-cta");
        confirm.addEventListener("click", async () => {
            if (this.selectedProjectKeys.length === 0) {
                new Notice("请至少选择一个清单");
                return;
            }
            await this.saveSelection();
            this.close();
        });
    }

    getProjectOptions(): ProjectCatalogEntry[] {
        return this.plugin.getAvailableProjectConfigs()
            .filter((project) => this.plugin.settings.showArchivedProjects || !project.isArchived);
    }

    renderProjectRow(containerEl: HTMLElement, project: ProjectCatalogEntry) {
        const key = this.plugin.getProjectFilterKey(project.id, project.name);
        const taskCount = this.plugin.getProjectTaskCount(project);
        const descParts = [`${taskCount} 个任务`];
        if (!this.plugin.isProjectVisible(project.id, project.name)) descParts.push("侧边栏隐藏");
        if (project.isArchived) descParts.push("已归档");

        new Setting(containerEl)
            .setName(project.name)
            .setDesc(descParts.join("，"))
            .addToggle((toggle) => toggle
                .setValue(this.selectedProjectKeys.includes(key))
                .onChange((value) => {
                    const next = new Set(this.selectedProjectKeys);
                    if (value) next.add(key);
                    else next.delete(key);
                    this.selectedProjectKeys = Array.from(next);
                    this.render();
                }));
    }

    async saveSelection() {
        this.plugin.settings.taskNoteSyncProjectKeys = [...this.selectedProjectKeys];
        await this.plugin.saveSettings();
        this.onSelectionChange([...this.selectedProjectKeys]);
    }

    onClose() {
        this.contentEl.empty();
    }
}
