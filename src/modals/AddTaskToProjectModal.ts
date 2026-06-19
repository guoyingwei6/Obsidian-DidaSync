import { App, Modal, Notice } from 'obsidian';
import DidaSyncPlugin from '../main';
import { DidaTask } from '../types';
import { DatePickerModal } from './DatePickerModal';

export class AddTaskToProjectModal extends Modal {
    plugin: DidaSyncPlugin;
    selectedDate: Date | null;
    selectedEndDate: Date | null;
    isAllDay: boolean;

    constructor(app: App, plugin: DidaSyncPlugin) {
        super(app);
        this.plugin = plugin;
        this.selectedDate = null;
        this.selectedEndDate = null;
        this.isAllDay = false;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "在项目中添加任务" });

        const projects = this.getAvailableProjects();
        if (projects.length === 0) {
            contentEl.createEl("p", {
                text: "没有可用的项目，请先同步或创建项目",
                cls: "dida-empty-state"
            });
        } else {
            const formDiv = contentEl.createDiv("dida-project-form-row");

            const projectGroup = formDiv.createDiv("dida-project-form-group");
            projectGroup.createEl("label", { text: "选择项目：" });

            const projectSelect = projectGroup.createEl("select", { cls: "dida-project-select dida-select-spaced" });
            projects.forEach(p => {
                projectSelect.createEl("option", {
                    value: JSON.stringify(p),
                    text: p.name
                });
            });

            const dateBtn = formDiv.createEl("button", {
                text: "📅",
                cls: "dida-date-btn"
            });

            const dateDisplay = formDiv.createEl("span", {
                text: "未设置",
                cls: "dida-date-display"
            });

            const titleGroup = contentEl.createDiv();
            titleGroup.setCssStyles({ margin: "20px 0" });
            titleGroup.createEl("label", { text: "任务标题：" });
            const titleInput = titleGroup.createEl("input", {
                type: "text",
                placeholder: "请输入任务标题",
                cls: "dida-task-title-input"
            });
            titleInput.addClass("dida-input-spaced");

            dateBtn.onclick = (e) => {
                new DatePickerModal(this.app, this.selectedDate || new Date(), (date, isAllDay, endDate) => {
                    this.selectedDate = date;
                    this.selectedEndDate = endDate || null;
                    this.isAllDay = isAllDay;

                    if (this.selectedDate) {
                        const dateStr = this.selectedDate.toLocaleDateString("zh-CN");
                        if (isAllDay) {
                            dateDisplay.textContent = dateStr + " 全天";
                        } else {
                            const timeStr = this.selectedDate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
                            const endTimeStr = (this.selectedEndDate || this.selectedDate).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
                            dateDisplay.textContent = dateStr + ` ${timeStr}～` + endTimeStr;
                        }
                        dateDisplay.classList.add("is-filled");
                    } else {
                        dateDisplay.textContent = "未设置";
                        dateDisplay.classList.remove("is-filled");
                    }
                }, e.currentTarget as HTMLElement, null, undefined).open();
            };

            const btnContainer = contentEl.createDiv("dida-modal-actions");

            btnContainer.createEl("button", { text: "取消" }).onclick = () => this.close();

            const submitBtn = btnContainer.createEl("button", {
                text: "添加任务",
                cls: "mod-cta"
            });
            submitBtn.onclick = async () => {
                const project = JSON.parse(projectSelect.value);
                const title = titleInput.value.trim();

                if (title) {
                    let startDate: string | null = null;
                    let dueDate: string | null = null;

                    if (this.selectedDate) {
                        startDate = this.selectedDate.toISOString();
                        dueDate = this.isAllDay ? startDate : (this.selectedEndDate || this.selectedDate).toISOString();
                    }

                    const newTask: DidaTask = {
                        id: Date.now().toString(),
                        title: title,
                        content: "",
                        completed: false,
                        status: 0,
                        completedTime: null,
                        didaId: null,
                        projectId: project.id,
                        projectName: project.name,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        startDate: startDate,
                        dueDate: dueDate,
                        isAllDay: this.isAllDay || false,
                        items: [],
                        kind: "TEXT",
                        priority: 0,
                        sortOrder: 0,
                        timeZone: this.plugin.getUserTimeZone(),
                        isFloating: false
                    };

                    this.plugin.settings.tasks = this.plugin.settings.tasks || [];
                    this.plugin.settings.tasks.push(newTask);
                    await this.plugin.saveSettings();
                    this.plugin.refreshTaskView();

                    // Trigger refresh on time block view if open? 
                    // Source used document.querySelector logic
                    const selectedTimelineDate = document.querySelector(".dida-timeline-date-item.dida-timeline-selected") as HTMLElement;
                    if (selectedTimelineDate) selectedTimelineDate.click();

                    if (this.plugin.settings.accessToken) {
                        try {
                            await this.plugin.createTaskInDidaList(newTask);
                            this.plugin.refreshTaskView();
                            if (selectedTimelineDate) selectedTimelineDate.click();
                        } catch (e) {
                            this.plugin.refreshTaskView();
                            if (selectedTimelineDate) selectedTimelineDate.click();
                        }
                    }
                    this.close();
                } else {
                    new Notice("请输入任务标题");
                }
            };

            titleInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") submitBtn.click();
            });

            setTimeout(() => titleInput.focus(), 100);
        }
    }

    onClose() {
        this.contentEl.empty();
    }

    getAvailableProjects() {
        const configs = this.plugin.getAvailableProjectConfigs();
        return configs.map((entry) => ({ id: entry.id, name: entry.name }));
    }
}
