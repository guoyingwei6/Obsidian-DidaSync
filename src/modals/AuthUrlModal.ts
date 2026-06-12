import { App, Modal, Setting } from "obsidian";

export class AuthUrlModal extends Modal {
    url: string;
    redirectUri: string;

    constructor(app: App, url: string, redirectUri: string) {
        super(app);
        this.url = url;
        this.redirectUri = redirectUri;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "OAuth认证" });
        contentEl.createEl("p", { text: "无法自动打开浏览器，请手动复制以下链接到浏览器中完成认证：" });
        const box = contentEl.createDiv("dida-auth-box");
        box.createEl("code", { text: this.url });
        contentEl.createEl("p", { text: "认证完成后，请确保浏览器重定向到了以下地址：" });
        contentEl.createEl("code", { text: this.redirectUri });
        new Setting(contentEl).addButton(btn => {
            btn.setButtonText("关闭").onClick(() => this.close());
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
