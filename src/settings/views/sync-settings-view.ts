import { App, Setting } from "obsidian";
import DidaSyncPlugin from "../../main";
import { ProjectVisibilityModal } from "../../modals/ProjectVisibilityModal";
import { TaskNoteProjectPickerModal } from "../../modals/TaskNoteProjectPickerModal";
import { AbstractSettingsView } from "./abstract-settings-view";

export class SyncSettingsView extends AbstractSettingsView {
    constructor(app: App, plugin: DidaSyncPlugin) {
        super(app, plugin);
    }

    render(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "同步设置" });

        new Setting(containerEl)
            .setName("自动同步")
            .setDesc("启用后会定期从滴答清单同步任务。")
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.autoSync)
                .onChange(async (value) => {
                    this.plugin.settings.autoSync = value;
                    await this.plugin.saveSettings();
                    this.plugin.syncManager.setupAutoSync();
                }));

        new Setting(containerEl)
            .setName("显示归档项目")
            .setDesc("选择是否在任务清单中显示已归档的项目。")
            .addDropdown((dropdown) => dropdown
                .addOption("false", "隐藏归档项目")
                .addOption("true", "显示归档项目")
                .setValue(this.plugin.settings.showArchivedProjects.toString())
                .onChange(async (value) => {
                    this.plugin.settings.showArchivedProjects = value === "true";
                    await this.plugin.saveSettings();
                    this.plugin.refreshTaskView();
                }));

        containerEl.createEl("h3", { text: "清单显示设置" });

        const projectVisibilityInfo = containerEl.createDiv("dida-settings-info dida-settings-info--primary");
        projectVisibilityInfo.setText("隐藏后的清单不会出现在侧边栏任务清单中，也可以在导入笔记时选择仅同步侧边栏可见清单。");

        const configurableProjects = this.plugin.getAvailableProjectConfigs()
            .filter((project) => this.plugin.settings.showArchivedProjects || !project.isArchived)
            .filter((project) => !this.plugin.isInboxProject(project.id, project.name));
        const hiddenCount = configurableProjects
            .filter((project) => !this.plugin.isProjectVisible(project.id, project.name))
            .length;
        new Setting(containerEl)
            .setName("清单显示")
            .setDesc(`收集箱固定显示；当前隐藏 ${hiddenCount} / ${configurableProjects.length} 个清单。`)
            .addButton((button) => button
                .setButtonText("管理清单显示")
                .onClick(() => {
                    new ProjectVisibilityModal(this.app, this.plugin, () => {
                        containerEl.empty();
                        this.render(containerEl);
                    }).open();
                }));

        new Setting(containerEl)
            .setName("同步间隔")
            .setDesc("自动从滴答清单同步的间隔时间（分钟）。")
            .addSlider((slider) => slider
                .setLimits(5, 120, 5)
                .setValue(this.plugin.settings.syncInterval)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.syncInterval = value;
                    await this.plugin.saveSettings();
                    this.plugin.syncManager.setupAutoSync();
                }));

        new Setting(containerEl)
            .setName("手动同步")
            .setDesc("立即执行双向同步。")
            .addButton((button) => button
                .setButtonText("开始同步")
                .onClick(async () => {
                    await this.plugin.manualSync();
                }));

        containerEl.createEl("h3", { text: "原生任务同步设置" });

        const nativeInfo = containerEl.createDiv("dida-settings-info dida-settings-info--primary");
        nativeInfo.setText('启用后可将 Obsidian 原生任务格式（- [ ]）同步到滴答清单，并在任务行追加跳转链接。');

        new Setting(containerEl)
            .setName("启用原生任务同步")
            .setDesc('启用后，输入 "- [ ] " 时会显示操作菜单，可选择同步到滴答清单。')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.enableNativeTaskSync)
                .onChange(async (value) => {
                    this.plugin.settings.enableNativeTaskSync = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl("h3", { text: "任务同步到笔记设置" });

        const noteSyncInfo = containerEl.createDiv("dida-settings-info dida-settings-info--primary");
        noteSyncInfo.setText("将某日、某周、某月、某年或自定义时间段内的任务汇总写入笔记。");

        new Setting(containerEl)
            .setName("写入区块")
            .setDesc("任务会写入这个 Markdown 区块；目标笔记中没有该区块时会自动创建。")
            .addText((text) => text
                .setPlaceholder("输入目标区块标题")
                .setValue(this.plugin.settings.taskNoteSyncTargetBlockHeader)
                .onChange(async (value) => {
                    this.plugin.settings.taskNoteSyncTargetBlockHeader = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("笔记保存位置")
            .setDesc("自动创建任务汇总笔记的文件夹。留空则保存到仓库根目录。")
            .addText((text) => text
                .setPlaceholder("DidaSync")
                .setValue(this.plugin.settings.taskNoteSyncFolder || "DidaSync")
                .onChange(async (value) => {
                    this.plugin.settings.taskNoteSyncFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("默认每次生成新笔记")
            .setDesc("开启后每次同步都会生成新笔记；关闭后默认写入同名笔记，不存在时再创建。")
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.taskNoteSyncCreateNewFile)
                .onChange(async (value) => {
                    this.plugin.settings.taskNoteSyncCreateNewFile = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("一周开始于")
            .setDesc("决定“某周”同步范围的起止日期。")
            .addDropdown((dropdown) => dropdown
                .addOption("monday", "周一")
                .addOption("sunday", "周日")
                .setValue(this.plugin.settings.taskNoteSyncWeekStart || "monday")
                .onChange(async (value) => {
                    this.plugin.settings.taskNoteSyncWeekStart = value as "monday" | "sunday";
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("同步前查询远端任务")
            .setDesc("开启后会按所选时间段向滴答清单查询最新任务；关闭后只使用本地缓存。")
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.taskNoteSyncUseRemoteQuery)
                .onChange(async (value) => {
                    this.plugin.settings.taskNoteSyncUseRemoteQuery = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("默认清单来源")
            .setDesc(this.getTaskNoteProjectScopePreviewText())
            .addDropdown((dropdown) => dropdown
                .addOption("all", "全部清单")
                .addOption("visible", "仅侧边栏可见清单")
                .addOption("custom", "自定义清单")
                .setValue(this.plugin.settings.taskNoteSyncProjectScope || "all")
                .onChange(async (value) => {
                    this.plugin.settings.taskNoteSyncProjectScope = value as "all" | "visible" | "custom";
                    await this.plugin.saveSettings();
                    containerEl.empty();
                    this.render(containerEl);
                }))
            .addButton((button) => {
                const isCustom = this.plugin.settings.taskNoteSyncProjectScope === "custom";
                button
                    .setButtonText("选择清单")
                    .setDisabled(!isCustom)
                    .onClick(() => {
                        if (!isCustom) return;
                        new TaskNoteProjectPickerModal(
                            this.app,
                            this.plugin,
                            this.plugin.settings.taskNoteSyncProjectKeys || [],
                            () => {
                                containerEl.empty();
                                this.render(containerEl);
                            }
                        ).open();
                    });
            });

        new Setting(containerEl)
            .setName("文件名规则")
            .setDesc("预留给后续模板扩展。当前留空即可，插件会按任务范围自动命名。")
            .addText((text) => text
                .setPlaceholder("留空使用默认规则")
                .setValue(this.plugin.settings.taskNoteSyncFileNamePattern || "")
                .onChange(async (value) => {
                    this.plugin.settings.taskNoteSyncFileNamePattern = value;
                    await this.plugin.saveSettings();
                }));
    }

    getTaskNoteProjectScopePreviewText(): string {
        const scope = this.plugin.settings.taskNoteSyncProjectScope || "all";
        if (scope === "all") return "同步任务到笔记时默认使用全部清单。";
        if (scope === "visible") {
            const visibleCount = this.plugin.getAvailableProjectConfigs()
                .filter((project) => this.plugin.settings.showArchivedProjects || !project.isArchived)
                .filter((project) => this.plugin.isProjectVisible(project.id, project.name))
                .length;
            return `同步任务到笔记时默认使用侧边栏可见清单（${visibleCount} 个）。`;
        }
        const keys = Array.isArray(this.plugin.settings.taskNoteSyncProjectKeys)
            ? this.plugin.settings.taskNoteSyncProjectKeys
            : [];
        return `同步任务到笔记时默认使用自定义清单（已选择 ${keys.length} 个）。`;
    }
}
