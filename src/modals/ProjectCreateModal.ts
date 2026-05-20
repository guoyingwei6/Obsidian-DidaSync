import { Modal, Notice } from "obsidian";

export class ProjectCreateModal extends Modal {
    onSubmit: (name: string) => void;
    inputEl: HTMLInputElement | null = null;
    submitted: boolean = false;

    constructor(app: any, onSubmit: (name: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const content = this.contentEl;
        content.empty();
        content.createEl("h3", { text: "新增项目标题" });
        content.createEl("p", {
            text: "输入新的项目标题。创建后会立即显示在列表中，并在后台同步到滴答清单。"
        });
        this.inputEl = content.createEl("input", {
            type: "text",
            placeholder: "输入项目标题"
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