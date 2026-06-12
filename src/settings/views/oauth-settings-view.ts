import { App, Setting } from "obsidian";
import DidaSyncPlugin from "../../main";
import { AbstractSettingsView } from "./abstract-settings-view";
import { debounce } from "../../utils";

export class OAuthSettingsView extends AbstractSettingsView {
    constructor(app: App, plugin: DidaSyncPlugin) {
        super(app, plugin);
    }

    render(containerEl: HTMLElement): void {
        const oauthContainer = containerEl.createDiv();
        oauthContainer.createEl("h3", { text: "OAuth 配置" });

        const step1Div = oauthContainer.createDiv("dida-settings-block");
        step1Div.createEl("p", {
            text: "第 1 步：请复制下面的链接到浏览器，进入滴答清单开发者后台，创建应用并获取 Client ID 和 Client Secret。"
        });

        const linkDiv = step1Div.createDiv("dida-settings-inline-row dida-settings-link-box");
        const manageInput = linkDiv.createEl("input", {
            type: "text",
            value: "https://developer.dida365.com/manage"
        });
        manageInput.readOnly = true;
        manageInput.addClass("dida-settings-readonly-input");
        manageInput.onclick = () => manageInput.select();

        const step2Div = oauthContainer.createDiv("dida-settings-block");
        step2Div.createEl("p", {
            text: "第 2 步：请将下面的 URI 复制到滴答清单开发者后台的 OAuth redirect URL，保存后点击 OAuth 认证按钮。"
        });

        const redirectDiv = step2Div.createDiv("dida-settings-code-box");
        redirectDiv.createEl("strong", { text: "重定向 URI 配置：" });
        redirectDiv.createEl("br");

        const uriDiv = redirectDiv.createDiv("dida-settings-inline-row dida-settings-inline-margin");
        const redirectInput = uriDiv.createEl("input", {
            type: "text",
            value: `http://localhost:${this.plugin.settings.serverPort}/callback`
        });
        redirectInput.readOnly = true;
        redirectInput.addClass("dida-settings-readonly-input");
        redirectInput.onclick = () => redirectInput.select();

        new Setting(containerEl)
            .setName("Client ID")
            .setDesc("滴答清单应用的 Client ID")
            .addText((text) => text
                .setPlaceholder("输入 Client ID")
                .setValue(this.plugin.settings.clientId)
                .onChange(async (value) => {
                    this.plugin.settings.clientId = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Client Secret")
            .setDesc("滴答清单应用的 Client Secret")
            .addText((text) => text
                .setPlaceholder("输入 Client Secret")
                .setValue(this.plugin.settings.clientSecret)
                .onChange(async (value) => {
                    this.plugin.settings.clientSecret = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("服务器端口")
            .setDesc("OAuth 回调服务器端口，修改后需要同步更新重定向 URI 配置。")
            .addText((text) => {
                const debouncedSave = debounce(async (value: string) => {
                    const port = parseInt(value, 10) || 8080;
                    this.plugin.settings.serverPort = port;
                    await this.plugin.saveSettings();
                    this.updateRedirectUriDisplay(containerEl, port);
                }, 300);

                text
                    .setPlaceholder("8080")
                    .setValue(this.plugin.settings.serverPort.toString())
                    .onChange(debouncedSave);
            });

        new Setting(containerEl)
            .setName("OAuth 认证")
            .setDesc("点击开始 OAuth 认证流程")
            .addButton((button) => button
                .setButtonText("开始认证")
                .onClick(() => {
                    this.plugin.apiClient.startOAuthFlow();
                }));

        const statusDiv = containerEl.createDiv("dida-settings-status");
        if (this.plugin.settings.accessToken) {
            statusDiv.addClass("dida-settings-status--success");
            statusDiv.textContent = "已认证";
        } else {
            statusDiv.addClass("dida-settings-status--error");
            statusDiv.textContent = "未认证";
        }
    }

    private updateRedirectUriDisplay(containerEl: HTMLElement, port: number) {
        containerEl.querySelectorAll('input[readonly]').forEach((element) => {
            const input = element as HTMLInputElement;
            if (input.value && input.value.includes("/callback")) {
                input.value = `http://localhost:${port}/callback`;
            }
        });
    }
}
