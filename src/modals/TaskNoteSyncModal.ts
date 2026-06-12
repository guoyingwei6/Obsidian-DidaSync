import { App, Modal, Notice, Setting, TFile } from "obsidian";
import DidaSyncPlugin from "../main";
import { TaskNoteSyncRangeType } from "../managers/TaskNoteSyncManager";
import { DatePickerModal } from "./DatePickerModal";

export class TaskNoteSyncModal extends Modal {
    plugin: DidaSyncPlugin;
    rangeType: TaskNoteSyncRangeType = "day";
    createNewFile = false;
    baseDate = "";
    startDate = "";
    endDate = "";
    previewEl: HTMLElement | null = null;

    constructor(app: App, plugin: DidaSyncPlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen() {
        const today = this.plugin.taskNoteSyncManager.formatDateOnly(new Date());
        const activeFile = this.app.workspace.getActiveFile();
        const targetDate = activeFile instanceof TFile
            ? await this.plugin.taskNoteSyncManager.resolveTargetDate(activeFile)
            : null;

        this.baseDate = targetDate || today;
        this.startDate = this.baseDate;
        this.endDate = this.baseDate;
        this.createNewFile = this.plugin.settings.taskNoteSyncCreateNewFile;
        this.render();
    }

    render() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "同步任务到笔记" });

        new Setting(contentEl)
            .setName("任务范围")
            .setDesc("选择要写入笔记的任务日期范围。")
            .addDropdown((dropdown) => dropdown
                .addOption("day", "某日")
                .addOption("week", "某周")
                .addOption("month", "某月")
                .addOption("year", "某年")
                .addOption("custom", "自定义时间段")
                .setValue(this.rangeType)
                .onChange((value) => {
                    this.rangeType = value as TaskNoteSyncRangeType;
                    this.render();
                }));

        if (this.rangeType === "custom") {
            this.addDateInput(contentEl, "开始日期", this.startDate, (value) => {
                this.startDate = value;
                this.updatePreview();
            });
            this.addDateInput(contentEl, "结束日期", this.endDate, (value) => {
                this.endDate = value;
                this.updatePreview();
            });
        } else {
            this.addDateInput(contentEl, "基准日期", this.baseDate, (value) => {
                this.baseDate = value;
                this.updatePreview();
            });
        }

        new Setting(contentEl)
            .setName("每次生成新笔记")
            .setDesc("开启后不会复用旧文件，会自动追加序号创建新笔记。关闭后优先写入同名笔记，不存在时再创建。")
            .addToggle((toggle) => toggle
                .setValue(this.createNewFile)
                .onChange(async (value) => {
                    this.createNewFile = value;
                    this.plugin.settings.taskNoteSyncCreateNewFile = value;
                    await this.plugin.saveSettings();
                    this.updatePreview();
                }));

        this.previewEl = contentEl.createDiv("dida-settings-info dida-settings-info--primary");
        this.updatePreview();

        const buttons = contentEl.createDiv("dida-calendar-buttons");
        buttons.createEl("button", { text: "取消" }).onclick = () => this.close();
        const syncButton = buttons.createEl("button", { text: "同步", cls: "mod-cta" });
        syncButton.onclick = async () => {
            const range = this.buildRange();
            if (!range) return;
            this.close();
            await this.plugin.taskNoteSyncManager.syncTasksToNote({
                range,
                createNewFile: this.createNewFile
            });
        };
    }

    addDateInput(containerEl: HTMLElement, name: string, value: string, onChange: (value: string) => void) {
        new Setting(containerEl)
            .setName(name)
            .addButton((button) => {
                button.setIcon("calendar");
                button.setButtonText(value || "选择日期");
                button.onClick(() => {
                    new DatePickerModal(
                        this.app,
                        value || null,
                        (date) => {
                            if (!date) return;
                            const nextValue = this.plugin.taskNoteSyncManager.formatDateOnly(date);
                            onChange(nextValue);
                            this.render();
                        },
                        button.buttonEl,
                        null,
                        null,
                        { dateOnly: true }
                    ).open();
                });
            });
    }

    buildRange() {
        if (this.rangeType === "custom") {
            if (!this.startDate || !this.endDate) {
                new Notice("请选择开始日期和结束日期");
                return null;
            }
            return this.plugin.taskNoteSyncManager.createRange("custom", this.startDate, this.endDate);
        }

        if (!this.baseDate) {
            new Notice("请选择基准日期");
            return null;
        }
        return this.plugin.taskNoteSyncManager.createRange(this.rangeType, this.baseDate);
    }

    updatePreview() {
        if (!this.previewEl) return;
        if (this.rangeType === "custom" && (!this.startDate || !this.endDate)) {
            this.previewEl.setText("请选择有效日期。");
            return;
        }
        if (this.rangeType !== "custom" && !this.baseDate) {
            this.previewEl.setText("请选择有效日期。");
            return;
        }

        const range = this.rangeType === "custom"
            ? this.plugin.taskNoteSyncManager.createRange("custom", this.startDate, this.endDate)
            : this.plugin.taskNoteSyncManager.createRange(this.rangeType, this.baseDate);

        const filePath = this.plugin.taskNoteSyncManager.buildTargetFilePath(range);
        const fileMode = this.createNewFile ? "生成新的笔记文件" : "写入同名笔记，若不存在则新建";
        this.previewEl.empty();
        this.previewEl.createDiv({ text: `任务范围：${range.startDate} 至 ${range.endDate}` });
        this.previewEl.createDiv({ text: `写入方式：${fileMode}` });
        this.previewEl.createDiv({ text: `目标位置：${filePath}` });
    }

    onClose() {
        this.contentEl.empty();
    }
}
