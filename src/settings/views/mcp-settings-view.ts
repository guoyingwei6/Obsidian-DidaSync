import { App, Notice, Setting } from "obsidian";
import DidaSyncPlugin from "../../main";
import { AbstractSettingsView } from "./abstract-settings-view";

export class McpSettingsView extends AbstractSettingsView {
    constructor(app: App, plugin: DidaSyncPlugin) {
        super(app, plugin);
    }

    render(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "MCP / AI 服务" });
        const mcpInfo = containerEl.createDiv();
        mcpInfo.style.cssText = "padding: 10px; border-radius: 5px; margin: 10px 0; color: #6c757d;";
        mcpInfo.innerHTML = "<strong>说明：</strong>启用后，AI 插件可以通过本机 HTTP MCP 服务调用 DidaSync。服务只监听 127.0.0.1，并需要 token 鉴权。";

        const endpoint = () => `http://127.0.0.1:${this.plugin.settings.mcpPort || 35829}/mcp`;
        const configText = () => JSON.stringify({
            transport: "http",
            url: endpoint(),
            headers: {
                Authorization: `Bearer ${this.plugin.settings.mcpToken || "<DIDASYNC_MCP_TOKEN>"}`
            }
        }, null, 2);

        const restartMcpServer = async () => {
            try {
                await this.plugin.mcpServerManager.restart();
                new Notice(this.plugin.settings.enableMcpServer ? "MCP 服务已更新" : "MCP 服务已关闭");
            } catch (e: any) {
                this.plugin.mcpServerManager.notifyStartupError(e);
            }
        };

        new Setting(containerEl).setName("启用 MCP 服务").setDesc("默认关闭。启用后允许本机 AI 插件通过 MCP 操作 DidaSync。").addToggle(t => t.setValue(this.plugin.settings.enableMcpServer).onChange(async value => {
            this.plugin.settings.enableMcpServer = value;
            if (value && !this.plugin.settings.mcpToken) this.plugin.settings.mcpToken = this.plugin.mcpServerManager.generateToken();
            await this.plugin.saveSettings();
            await restartMcpServer();
            containerEl.empty();
            this.render(containerEl);
        }));

        new Setting(containerEl).setName("MCP 端口").setDesc("AI 插件连接的本机 HTTP 端口。默认 35829。").addText(t => t.setPlaceholder("35829").setValue((this.plugin.settings.mcpPort || 35829).toString()).onChange(async value => {
            const port = parseInt(value) || 35829;
            this.plugin.settings.mcpPort = port;
            await this.plugin.saveSettings();
            if (this.plugin.settings.enableMcpServer) await restartMcpServer();
        }));

        new Setting(containerEl).setName("只读模式").setDesc("启用后 MCP 只能读取任务，不能创建、更新、完成、删除、排程或同步。").addToggle(t => t.setValue(this.plugin.settings.mcpReadOnly).onChange(async value => {
            this.plugin.settings.mcpReadOnly = value;
            await this.plugin.saveSettings();
        }));

        new Setting(containerEl).setName("MCP Token").setDesc(this.plugin.settings.mcpToken ? "用于 AI 插件鉴权，请勿公开。可手动选择下面显示的 token 进行复制。" : "启用 MCP 服务时会自动生成。").addButton(t => t.setButtonText("重新生成").setWarning().onClick(async () => {
            this.plugin.settings.mcpToken = this.plugin.mcpServerManager.generateToken();
            await this.plugin.saveSettings();
            new Notice("MCP Token 已重新生成");
            containerEl.empty();
            this.render(containerEl);
        }));

        if (this.plugin.settings.mcpToken) {
            const tokenPre = containerEl.createEl("pre");
            tokenPre.style.cssText = "white-space: pre-wrap; padding: 10px; border-radius: 5px; overflow-x: auto; user-select: text;";
            tokenPre.setText(this.plugin.settings.mcpToken);
        }

        new Setting(containerEl)
            .setName("Skill 文档路径")
            .setDesc("一键导出时写入到当前 vault 的相对路径，默认会创建 dida 文件夹并写入 SKILL.md。")
            .addText(t => t
                .setPlaceholder("dida/SKILL.md")
                .setValue(this.plugin.settings.mcpSkillNotePath || "dida/SKILL.md")
                .onChange(async value => {
                    this.plugin.settings.mcpSkillNotePath = value.trim() || "dida/SKILL.md";
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("导出 Dida Skill 文档")
            .setDesc("将内置的 Dida skill 文档一键写入本地 vault，方便在 Obsidian 中直接查看和给 AI 工具使用。")
            .addButton(t => t.setButtonText("导出到 Vault").setCta().onClick(async () => {
                try {
                    const path = await this.plugin.exportMcpSkillDocument();
                    new Notice(`Skill 文档已导出到 ${path}`);
                } catch (e: any) {
                    new Notice(`Skill 文档导出失败: ${e?.message || e}`);
                }
            }));

        const configDiv = containerEl.createDiv();
        configDiv.style.cssText = "margin: 10px 0;";
        configDiv.createEl("strong", { text: "AI 插件配置：" });
        const configInput = configDiv.createEl("textarea");
        configInput.style.cssText = "width: 100%; min-height: 220px; padding: 10px; border-radius: 8px; resize: vertical; box-sizing: border-box;";
        configInput.readOnly = true;
        configInput.value = configText();
        configInput.onclick = () => configInput.select();
    }
}
