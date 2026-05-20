import { Modal } from "obsidian";
import { ProjectCatalogEntry } from "../types";

export class ProjectDeleteConfirmModal extends Modal {
    project: ProjectCatalogEntry;
    onConfirm: () => void;

    constructor(app: any, project: ProjectCatalogEntry, onConfirm: () => void) {
        super(app);
        this.project = project;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const content = this.contentEl;
        content.empty();
        content.createEl("h3", { text: `删除项目标题：${this.project.name}` });
        content.createEl("p", {
            text: "该项目当前没有任务。确认后会删除本地项目标题，并同步删除滴答清单中的对应项目。"
        });

        const footer = content.createDiv();
        footer.style.display = "flex";
        footer.style.justifyContent = "flex-end";
        footer.style.gap = "8px";
        footer.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
        const confirm = footer.createEl("button", { text: "删除" });
        confirm.addClass("mod-warning");
        confirm.addEventListener("click", () => {
            this.onConfirm();
            this.close();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}