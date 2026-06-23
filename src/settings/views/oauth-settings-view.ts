import { App, Notice, Platform, Setting } from "obsidian";
import DidaSyncPlugin from "../../main";
import { OAuthCallbackMode } from "../../types";
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
            text: Platform.isMobile
                ? "第 2 步：将下面的移动端回调 URI 复制到滴答清单开发者后台的 OAuth redirect URL。若后台不接受 obsidian:// URI，请使用下方手动模式。"
                : "第 2 步：先设置回调地址和端口，再将下面的 URI 复制到滴答清单开发者后台的 OAuth redirect URL，保存后点击 OAuth 认证按钮。"
        });

        if (!Platform.isMobile) {
            new Setting(step2Div)
                .setName("回调地址")
                .setDesc("修改后请同步更新开发者后台的 redirect URL。")
                .addDropdown((dropdown) => dropdown
                    .addOption("localhost", "localhost")
                    .addOption("ipv4", "127.0.0.1")
                    .setValue(this.getCallbackMode())
                    .onChange(async (value: OAuthCallbackMode) => {
                        this.plugin.settings.oauthCallbackMode = value === "ipv4" ? "ipv4" : "localhost";
                        await this.plugin.saveSettings();
                        this.updateRedirectUriDisplay(step2Div, this.plugin.settings.serverPort);
                        new Notice("OAuth 回调地址已切换，请将开发者后台 redirect URL 更新为当前显示的地址。");
                    }));

            new Setting(step2Div)
                .setName("服务器端口")
                .setDesc("修改后请同步更新开发者后台的 redirect URL。")
                .addText((text) => {
                    const debouncedSave = debounce(async (value: string) => {
                        const port = parseInt(value, 10) || 8080;
                        this.plugin.settings.serverPort = port;
                        await this.plugin.saveSettings();
                        this.updateRedirectUriDisplay(step2Div, port);
                    }, 300);

                    text
                        .setPlaceholder("8080")
                        .setValue(this.plugin.settings.serverPort.toString())
                        .onChange(debouncedSave);
                });
        }

        const redirectDiv = step2Div.createDiv("dida-settings-code-box");
        redirectDiv.createEl("strong", { text: "重定向 URI：" });
        redirectDiv.createEl("br");

        const uriDiv = redirectDiv.createDiv("dida-settings-inline-row dida-settings-inline-margin");
        const redirectInput = uriDiv.createEl("input", {
            type: "text",
            value: this.plugin.apiClient.getRedirectUri()
        });
        redirectInput.readOnly = true;
        redirectInput.addClass("dida-settings-readonly-input");
        redirectInput.onclick = () => redirectInput.select();

        if (!Platform.isMobile) {
            step2Div.createEl("p", {
                text: "如果开发者后台已登记旧地址，可继续使用 localhost；如果 Windows 上授权后回调页空白或长时间无响应，可切换为 127.0.0.1。"
            });
        } else {
            step2Div.createEl("p", {
                text: "移动端优先使用 obsidian:// 回调；如果滴答后台不接受该 URI，可使用手动模式。"
            });
        }

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
            .setName("OAuth 认证")
            .setDesc("点击开始 OAuth 认证流程")
            .addButton((button) => button
                .setButtonText("开始认证")
                .onClick(() => {
                    this.plugin.apiClient.startOAuthFlow();
                }));

        if (Platform.isMobile) {
            const manualRedirectDiv = containerEl.createDiv("dida-settings-code-box");
            manualRedirectDiv.createEl("strong", { text: "手动模式重定向 URI：" });
            manualRedirectDiv.createEl("br");
            const manualRedirectInput = manualRedirectDiv.createEl("input", {
                type: "text",
                value: this.plugin.apiClient.getLocalRedirectUri()
            });
            manualRedirectInput.readOnly = true;
            manualRedirectInput.addClass("dida-settings-readonly-input");
            manualRedirectInput.onclick = () => manualRedirectInput.select();

            new Setting(containerEl)
                .setName("手动认证链接")
                .setDesc("当 obsidian:// 回调不可用时，使用 localhost 回调。浏览器会打开一个无法连接的 localhost 页面，请从地址栏复制 code 参数。")
                .addButton((button) => button
                    .setButtonText("打开手动认证")
                    .onClick(() => {
                        this.plugin.apiClient.startManualOAuthFlow();
                    }));

            let manualCode = "";
            new Setting(containerEl)
                .setName("手动授权码")
                .setDesc("将授权后得到的 code 粘贴到这里完成认证。")
                .addText((text) => text
                    .setPlaceholder("粘贴 OAuth code")
                    .onChange((value) => {
                        manualCode = value.trim();
                    }))
                .addButton((button) => button
                    .setButtonText("提交授权码")
                    .onClick(async () => {
                        if (!manualCode) {
                            new Notice("请先输入授权码");
                            return;
                        }
                        await this.plugin.apiClient.handleOAuthCallback(manualCode, this.plugin.apiClient.getLocalRedirectUri());
                        containerEl.empty();
                        this.render(containerEl);
                    }));
        }

        const statusDiv = containerEl.createDiv("dida-settings-status");
        if (this.plugin.settings.accessToken) {
            statusDiv.addClass("dida-settings-status--success");
            statusDiv.textContent = "已认证";
        } else {
            statusDiv.addClass("dida-settings-status--error");
            statusDiv.textContent = "未认证";
        }
    }

    private getCallbackMode(): OAuthCallbackMode {
        return this.plugin.settings.oauthCallbackMode === "ipv4" ? "ipv4" : "localhost";
    }

    private updateRedirectUriDisplay(containerEl: HTMLElement, port: number) {
        containerEl.querySelectorAll('input[readonly]').forEach((element) => {
            const input = element as HTMLInputElement;
            if (input.value && input.value.includes("/callback")) {
                input.value = this.plugin.apiClient.getLocalRedirectUri();
            }
        });
    }
}
