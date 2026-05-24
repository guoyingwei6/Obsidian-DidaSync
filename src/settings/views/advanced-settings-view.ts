import { App, Notice, Setting } from "obsidian";
import DidaSyncPlugin from "../../main";
import { AbstractSettingsView } from "./abstract-settings-view";

export class AdvancedSettingsView extends AbstractSettingsView {
    constructor(app: App, plugin: DidaSyncPlugin) {
        super(app, plugin);
    }

    render(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "自动清理设置" });
        const cleanInfo = containerEl.createDiv();
        cleanInfo.style.cssText = "padding: 10px; border-radius: 5px; margin: 10px 0; color: #6c757d;";
        cleanInfo.innerHTML = "<strong>说明：</strong>启用自动清理功能后，插件会在每次启动时（延迟30秒）自动清理指定时间之前的已完成任务数据，以保持数据文件的整洁。此操作仅清理本地数据，不会影响滴答清单云端数据。";

        new Setting(containerEl).setName("自动清理已完成任务").setDesc("启用后会在插件启动时自动清理指定时间之前的已完成任务数据").addToggle(t => t.setValue(this.plugin.settings.autoCleanCompletedTasks).onChange(async t => {
            this.plugin.settings.autoCleanCompletedTasks = t;
            await this.plugin.saveSettings();
        }));

        new Setting(containerEl).setName("清理间隔").setDesc("自动清理已完成任务的时间间隔（月数）").addDropdown(e => {
            for (let t = 1; t <= 12; t++) e.addOption(t.toString(), t + "个月");
            e.setValue(this.plugin.settings.autoCleanInterval.toString()).onChange(async t => {
                this.plugin.settings.autoCleanInterval = parseInt(t);
                await this.plugin.saveSettings();
            });
        });

        containerEl.createEl("h3", { text: "数据重置" });
        const resetInfo = containerEl.createDiv();
        resetInfo.style.cssText = "padding: 10px; border-radius: 5px; margin: 10px 0; color: #856404; border: 1px solid #ffeaa7;";
        resetInfo.innerHTML = "<strong>⚠️ 警告：</strong>此操作将完全清空本地任务数据，并从滴答清单云端重新获取最新数据。此操作不可逆，建议备份仓库后使用。(适用于Obsidian本地任务数据已经破坏、异常等情况）";

        new Setting(containerEl).setName("重置任务数据").setDesc("清空本地任务数据,并重新从云端获取任务到你的Obsidian").addButton(t => t.setButtonText("重置数据").setWarning().onClick(async () => {
            if (this.plugin.settings.accessToken) {
                if (confirm('确定要重置任务数据吗？\n\n此操作将：\n• 完全清空本地任务数据\n• 重新从滴答清单云端获取数据\n• 此操作不可逆\n\n点击"确定"继续，点击"取消"放弃操作。')) {
                    this.plugin.settings.tasks = [];
                    await this.plugin.saveSettings();
                    await this.plugin.syncManager.syncFromDidaList();
                }
            } else {
                new Notice("请先进行OAuth认证");
            }
        }));

        containerEl.createEl("h3", { text: "MCP 服务" });
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

        new Setting(containerEl).setName("MCP 端口").setDesc("AI 插件连接的本机 HTTP 端口。").addText(t => t.setPlaceholder("35829").setValue((this.plugin.settings.mcpPort || 35829).toString()).onChange(async value => {
            const port = parseInt(value) || 35829;
            this.plugin.settings.mcpPort = port;
            await this.plugin.saveSettings();
            if (this.plugin.settings.enableMcpServer) await restartMcpServer();
        }));

        new Setting(containerEl).setName("只读模式").setDesc("启用后 MCP 只能读取任务，不能创建、更新、完成、删除或同步。").addToggle(t => t.setValue(this.plugin.settings.mcpReadOnly).onChange(async value => {
            this.plugin.settings.mcpReadOnly = value;
            await this.plugin.saveSettings();
        }));

        new Setting(containerEl).setName("MCP Token").setDesc(this.plugin.settings.mcpToken ? "用于 AI 插件鉴权，请勿公开。" : "启用 MCP 服务时会自动生成。").addButton(t => t.setButtonText("复制").onClick(() => {
            navigator.clipboard.writeText(this.plugin.settings.mcpToken || "");
            new Notice("MCP Token 已复制");
        })).addButton(t => t.setButtonText("重新生成").setWarning().onClick(async () => {
            this.plugin.settings.mcpToken = this.plugin.mcpServerManager.generateToken();
            await this.plugin.saveSettings();
            new Notice("MCP Token 已重新生成");
            containerEl.empty();
            this.render(containerEl);
        }));

        const configDiv = containerEl.createDiv();
        configDiv.style.cssText = "margin: 10px 0;";
        configDiv.createEl("strong", { text: "AI 插件配置：" });
        const configPre = configDiv.createEl("pre");
        configPre.style.cssText = "white-space: pre-wrap; padding: 10px; border-radius: 5px; overflow-x: auto;";
        configPre.setText(configText());
        configDiv.createEl("button", { text: "复制配置", cls: "mod-small" }).onclick = () => {
            navigator.clipboard.writeText(configText());
            new Notice("MCP 配置已复制");
        };
    }
}
