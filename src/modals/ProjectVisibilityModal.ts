import { App, Modal, Notice, Setting } from "obsidian";
import DidaSyncPlugin from "../main";
import { ProjectCatalogEntry } from "../types";

export class ProjectVisibilityModal extends Modal {
    plugin: DidaSyncPlugin;
    onChange: () => void;

    constructor(app: App, plugin: DidaSyncPlugin, onChange: () => void) {
        super(app);
        this.plugin = plugin;
        this.onChange = onChange;
    }

    onOpen() {
        this.render();
    }

    render() {
        const content = this.contentEl;
        content.empty();
        content.createEl("h3", { text: "管理清单显示" });

        const projects = this.getProjects();
        if (projects.length === 0) {
            content.createDiv("dida-settings-info", { text: "暂无可配置清单，请先同步任务。" });
        } else {
            projects.forEach((project) => this.renderProjectRow(content, project));
        }

        const footer = content.createDiv("dida-modal-actions-row");
        const closeButton = footer.createEl("button", { text: "完成" });
        closeButton.addClass("mod-cta");
        closeButton.addEventListener("click", () => this.close());
    }

    getProjects(): ProjectCatalogEntry[] {
        return this.plugin.getAvailableProjectConfigs()
            .filter((project) => this.plugin.settings.showArchivedProjects || !project.isArchived);
    }

    renderProjectRow(containerEl: HTMLElement, project: ProjectCatalogEntry) {
        const taskCount = this.plugin.getProjectTaskCount(project);
        const descParts = [`${taskCount} 个任务`];
        if (project.isArchived) descParts.push("已归档");

        const isInbox = this.plugin.isInboxProject(project.id, project.name);
        if (isInbox) descParts.push("固定显示");

        new Setting(containerEl)
            .setName(project.name)
            .setDesc(descParts.join("，"))
            .addToggle((toggle) => {
                toggle
                    .setValue(isInbox || this.plugin.isProjectVisible(project.id, project.name))
                    .onChange(async (value) => {
                        if (isInbox) {
                            new Notice("收集箱固定显示，不能隐藏");
                            this.render();
                            return;
                        }
                        await this.plugin.setProjectHidden(project.id, project.name, !value);
                        this.onChange();
                        this.render();
                    });
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}
