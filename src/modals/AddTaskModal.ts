import { App, Notice } from "obsidian";
import { TaskScheduleInput } from "../types";
import { ScopedPopup, TaskSchedulePicker } from "./TaskSchedulePicker";

export interface TaskCreateProject {
    id: string;
    name: string;
}

interface AddTaskModalOptions {
    projects: TaskCreateProject[];
    defaultProjectId?: string;
    defaultDate?: Date;
    triggerElement?: HTMLElement | null;
    scopeElement?: HTMLElement | null;
}

export class AddTaskModal {
    app: App;
    onSubmit: (title: string, project: TaskCreateProject, schedule: TaskScheduleInput) => void | Promise<void>;
    options: AddTaskModalOptions;
    popup: ScopedPopup;

    constructor(
        app: App,
        onSubmit: (title: string, project: TaskCreateProject, schedule: TaskScheduleInput) => void | Promise<void>,
        options: AddTaskModalOptions
    ) {
        this.app = app;
        this.onSubmit = onSubmit;
        this.options = options;
        this.popup = new ScopedPopup(options.triggerElement || null, options.scopeElement || null, "dida-task-create-popup");
    }

    open(): void {
        this.popup.open(container => {
            const fields = container.createDiv("dida-task-create-fields");
            fields.createEl("h3", { text: "添加任务" });
            const titleInput = fields.createEl("input", {
                type: "text",
                placeholder: "输入任务标题…",
                cls: "dida-task-create-title"
            });

            const projectRow = fields.createDiv("dida-task-create-project");
            projectRow.createEl("label", { text: "项目" });
            const projectSelect = projectRow.createEl("select");
            this.options.projects.forEach(project => {
                projectSelect.createEl("option", { text: project.name, value: project.id });
            });
            projectSelect.value = this.options.defaultProjectId || this.options.projects[0]?.id || "inbox";

            const picker = new TaskSchedulePicker(this.app, {
                defaultDate: this.options.defaultDate || new Date(),
                isAllDay: true
            });
            picker.render(container);
            picker.renderActions(container, {
                primaryLabel: "添加",
                onCancel: () => this.close(),
                onSubmit: async value => {
                    const title = titleInput.value.trim();
                    if (!title) {
                        new Notice("请输入任务标题");
                        titleInput.focus();
                        return false;
                    }
                    const project = this.options.projects.find(item => item.id === projectSelect.value) || this.options.projects[0];
                    if (!project) {
                        new Notice("没有可用项目");
                        return false;
                    }
                    await this.onSubmit(title, project, {
                        startDate: value.startDate ? value.startDate.toISOString() : null,
                        dueDate: value.dueDate ? value.dueDate.toISOString() : null,
                        isAllDay: value.isAllDay,
                        repeatFlag: value.repeatFlag
                    });
                    this.close();
                }
            });

            titleInput.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    (container.querySelector(".dida-task-schedule-actions .mod-cta") as HTMLButtonElement | null)?.click();
                }
            });
            setTimeout(() => titleInput.focus(), 50);
        });
    }

    close(): void {
        this.popup.close();
    }
}
