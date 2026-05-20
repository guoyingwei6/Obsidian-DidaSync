import { Modal, Notice } from "obsidian";
import { ProjectCatalogEntry } from "../types";

export class ProjectRenameModal extends Modal {
    project: ProjectCatalogEntry;
    onSubmit: (name: string) => void;
    inputEl: HTMLInputElement | null = null;
    submitted: boolean = false;

    constructor(app: any, project: ProjectCatalogEntry, onSubmit: (name: string) => void) {
        super(app);
        this.project = project;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const content = this.contentEl;
        content.empty();
        content.createEl("h3", { text: `修改项目标题：${this.project.name}` });
        content.createEl("p", {
            text: "输入新的项目标题。若该项目来自滴答清单，将同步修改云端项目名称。"
        });
        this.inputEl = content.createEl("input", {
            type: "text",
            value: this.project.name
        });
        this.inputEl.style.width = "100%";
        this.inputEl.style.marginBottom = "12px";

        const footer = content.createDiv();
        footer.style.display = "flex";
        footer.style.justifyContent = "flex-end";
        footer.style.gap = "8px";
        footer.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
        const confirm = footer.createEl("button", { text: "确定" });
        confirm.addClass("mod-cta");
        confirm.addEventListener("click", () => this.submit());
        this.inputEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                this.submit();
            }
        });

        window.setTimeout(() => {
            this.inputEl?.focus();
            this.inputEl?.select();
        }, 0);
    }

    submit() {
        const value = (this.inputEl?.value || "").trim();
        if (!value) {
            new Notice("项目标题不能为空");
            this.inputEl?.focus();
            this.inputEl?.select();
            return;
        }
        this.submitted = true;
        this.onSubmit(value);
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}